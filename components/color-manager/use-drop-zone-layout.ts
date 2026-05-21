"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react"

type UseDropZoneLayoutOptions = {
  /** Fallback width when nothing has been measured yet (e.g. the selected card token width). */
  fallbackWidth: number
  /** When true, layout recompute is paused so drag interactions don't reshuffle the zones. */
  isDragging: boolean
  /** Resolve the first card element to measure for the canonical drop-zone width. */
  getFirstCard: () => HTMLElement | null
  /** Outer container ref used for the resize observer + width measurement. */
  containerRef: RefObject<HTMLElement | null>
  /** Inner layout ref preferred when present (falls back to container). */
  layoutRef: RefObject<HTMLElement | null>
  /** Re-measure when this index changes (e.g. selected card size). */
  cardSizeIndex: number
  /** Re-measure when this count changes (e.g. number of swatches). */
  swatchCount: number
}

type UseDropZoneLayoutResult = {
  /** Pixel width to apply to each drop zone (rounded, never negative). */
  dropZoneWidth: number
  /** Inline style for the drop-zone elements derived from dropZoneWidth. */
  dropZoneDimensionStyle: CSSProperties | undefined
  /** When true, the two zones stack vertically; otherwise sit side-by-side. */
  dropZonesStacked: boolean
}

/**
 * Measure the first card's rendered width and decide whether the "new group"
 * and "delete" drop zones should sit side-by-side or stack vertically.
 *
 * Layout updates are paused while `isDragging` is true so the zones don't
 * shift under the pointer mid-drag. The hook owns:
 *   - A ResizeObserver on the first card (drives `dropZoneWidth`).
 *   - A ResizeObserver on the layout container + a window `resize` listener
 *     (drives `dropZonesStacked`).
 */
export function useDropZoneLayout({
  fallbackWidth,
  isDragging,
  getFirstCard,
  containerRef,
  layoutRef,
  cardSizeIndex,
  swatchCount,
}: UseDropZoneLayoutOptions): UseDropZoneLayoutResult {
  const [dropZoneWidth, setDropZoneWidth] = useState(fallbackWidth)
  const [dropZonesStacked, setDropZonesStacked] = useState(false)

  // Mirror the latest dragging flag for use inside callbacks where reading
  // the closed-over `isDragging` would lag a frame.
  const isDraggingRef = useRef(isDragging)
  useEffect(() => {
    isDraggingRef.current = isDragging
  }, [isDragging])

  const getFirstCardRef = useRef(getFirstCard)
  useEffect(() => {
    getFirstCardRef.current = getFirstCard
  }, [getFirstCard])

  const dropZoneDimensionStyle = useMemo<CSSProperties | undefined>(() => {
    if (!dropZoneWidth) return undefined
    const roundedWidth = Math.max(0, Math.round(dropZoneWidth))
    return { width: `${roundedWidth}px`, maxWidth: `${roundedWidth}px` }
  }, [dropZoneWidth])

  const updateDropZoneWidth = useCallback((nextWidth: number | null | undefined) => {
    if (!nextWidth || Number.isNaN(nextWidth)) return
    if (isDraggingRef.current) return
    const rounded = Math.max(0, Math.round(nextWidth))
    setDropZoneWidth((previous) => (previous === rounded ? previous : rounded))
  }, [])

  const measureDropZoneWidth = useCallback(() => {
    if (isDraggingRef.current) return
    let measured = fallbackWidth
    const cardElement = getFirstCardRef.current()
    if (cardElement) {
      const rect = cardElement.getBoundingClientRect()
      if (rect.width > 0) {
        measured = rect.width
      }
    }
    updateDropZoneWidth(measured)
  }, [fallbackWidth, updateDropZoneWidth])

  // Initial + cardSizeIndex/swatchCount measurement.
  useLayoutEffect(() => {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(measureDropZoneWidth)
    } else {
      setTimeout(measureDropZoneWidth, 0)
    }
  }, [measureDropZoneWidth, cardSizeIndex, swatchCount])

  // Observe the first card for live width updates.
  useEffect(() => {
    if (typeof window === "undefined" || typeof ResizeObserver === "undefined") return
    const firstCard = getFirstCardRef.current()
    if (!firstCard) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        if (width) {
          updateDropZoneWidth(width)
        }
      }
    })

    observer.observe(firstCard)
    return () => observer.disconnect()
  }, [updateDropZoneWidth, cardSizeIndex, swatchCount])

  const recomputeDropZoneLayout = useCallback(() => {
    const container = layoutRef.current ?? containerRef.current
    if (!container || typeof window === "undefined") return
    if (isDraggingRef.current) return

    const containerWidth = container.clientWidth
    const styles = window.getComputedStyle(container)
    const gapValueRaw = styles.columnGap || styles.gap || "0"
    const gap = Number.parseFloat(gapValueRaw) || 0
    const targetWidth = dropZoneWidth || fallbackWidth
    if (!targetWidth) return
    const requiredWidth = targetWidth * 2 + gap + 4
    const shouldStack = containerWidth < requiredWidth
    setDropZonesStacked((previous) => (previous === shouldStack ? previous : shouldStack))
  }, [containerRef, dropZoneWidth, fallbackWidth, layoutRef])

  useLayoutEffect(() => {
    recomputeDropZoneLayout()
  }, [recomputeDropZoneLayout])

  useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof ResizeObserver === "undefined") return
    const container = layoutRef.current ?? containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      if (isDraggingRef.current) return
      recomputeDropZoneLayout()
    })
    observer.observe(container)
    window.addEventListener("resize", recomputeDropZoneLayout)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", recomputeDropZoneLayout)
    }
  }, [containerRef, layoutRef, recomputeDropZoneLayout])

  // After a drag ends, recompute once so the layout catches up if the
  // container changed while the freeze was active.
  useEffect(() => {
    if (!isDragging) {
      recomputeDropZoneLayout()
    }
  }, [isDragging, recomputeDropZoneLayout])

  return { dropZoneWidth, dropZoneDimensionStyle, dropZonesStacked }
}
