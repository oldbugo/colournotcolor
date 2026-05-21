"use client"

import { useEffect, useRef } from "react"

type PointerLike = { x: number; y: number }

type UseDragAutoScrollOptions = {
  /** When true, a requestAnimationFrame loop runs and scrolls near viewport edges. */
  active: boolean
  /** Returns the current pointer position in viewport coordinates, or null if unknown. */
  getPointer: () => PointerLike | null
  /** Returns the scroll parent to drive, or null. */
  getScrollParent: () => HTMLElement | null
  /** Pixels from the edge inside which scrolling starts. Defaults to 180. */
  edgeThresholdPx?: number
  /** Minimum pixels-per-frame at the edge (eased ramp). Defaults to 4. */
  minScrollSpeed?: number
  /** Maximum pixels-per-frame at the edge (eased ramp). Defaults to 28. */
  maxScrollSpeed?: number
}

/**
 * While `active` is true, run a requestAnimationFrame loop that scrolls the
 * provided scroll parent vertically whenever the pointer sits inside the top
 * or bottom edge band. The ramp is quadratic-eased so the speed grows as the
 * pointer approaches the edge.
 *
 * Intended for use during native HTML5 drag-and-drop, where the drag event
 * stream does not include automatic edge scrolling. The `getPointer` and
 * `getScrollParent` callbacks are read through refs, so the consumer does not
 * need to memoise them.
 */
export function useDragAutoScroll({
  active,
  getPointer,
  getScrollParent,
  edgeThresholdPx = 180,
  minScrollSpeed = 4,
  maxScrollSpeed = 28,
}: UseDragAutoScrollOptions) {
  const getPointerRef = useRef(getPointer)
  const getScrollParentRef = useRef(getScrollParent)
  useEffect(() => {
    getPointerRef.current = getPointer
    getScrollParentRef.current = getScrollParent
  }, [getPointer, getScrollParent])

  useEffect(() => {
    if (!active || typeof window === "undefined" || typeof document === "undefined") {
      return
    }

    const scrollParent = getScrollParentRef.current()
    if (!scrollParent) {
      return
    }

    let rafId = 0

    const step = () => {
      const pointer = getPointerRef.current()
      if (pointer) {
        const isDocumentScroller =
          scrollParent === document.body ||
          scrollParent === document.documentElement ||
          scrollParent === document.scrollingElement

        let topBoundary = 0
        let bottomBoundary = window.innerHeight ?? 0

        if (!isDocumentScroller) {
          const rect = scrollParent.getBoundingClientRect()
          topBoundary = rect.top
          bottomBoundary = rect.bottom
        }

        const viewportHeight = Math.max(bottomBoundary - topBoundary, 1)
        const threshold = Math.min(edgeThresholdPx, viewportHeight / 2)

        if (threshold > 0) {
          let delta = 0

          const distanceToTop = pointer.y - topBoundary
          const normalizedTopDistance = Math.max(distanceToTop, 0)
          if (normalizedTopDistance < threshold) {
            const intensity = (threshold - normalizedTopDistance) / threshold
            const eased = intensity * intensity
            delta = -(minScrollSpeed + (maxScrollSpeed - minScrollSpeed) * eased)
          } else {
            const distanceToBottom = bottomBoundary - pointer.y
            const normalizedBottomDistance = Math.max(distanceToBottom, 0)
            if (normalizedBottomDistance < threshold) {
              const intensity = (threshold - normalizedBottomDistance) / threshold
              const eased = intensity * intensity
              delta = minScrollSpeed + (maxScrollSpeed - minScrollSpeed) * eased
            }
          }

          if (delta !== 0) {
            scrollParent.scrollTop += delta
          }
        }
      }

      rafId = window.requestAnimationFrame(step)
    }

    rafId = window.requestAnimationFrame(step)
    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [active, edgeThresholdPx, minScrollSpeed, maxScrollSpeed])
}
