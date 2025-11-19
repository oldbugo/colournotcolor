"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react"
import type React from "react"
import type { DragIndicatorPosition } from "@/components/color-manager/types"
import { CARD_GRID_GAP } from "@/lib/design-tokens"

export const GROUP_SECTION_METRICS = {
  swapOutset: {
    top: 10,
    bottom: 14,
    horizontal: 10,
  },
  swapRadius: 18,
  insertGap: 32,
  insertHorizontalOutset: 20,
  insertThickness: 4,
  insertIndicatorOffsetTop: 19,
  insertIndicatorOffsetBottom: 19,
  insertIndicatorExtraWidth: 6,
  insertMidpointDeadzone: 12,
  edgeInsertThreshold: 28,
  horizontalDetectionOutset: 40,
} as const

export const GROUP_SECTION_ANIMATION_MS = 300
const HEIGHT_MEASURE_DEBOUNCE_MS = 70

type GroupSectionProps = {
  groupName: string
  isGroupDragging: boolean
  isGroupDragOver: boolean
  isNewlyCreated: boolean
  isRemoving: boolean
  indicatorPosition: DragIndicatorPosition | null
  showIndicator: boolean
  cardColumnCount: number
  isCollapsed: boolean
  isInsertTarget: boolean
  insertPosition: "before" | "after" | null
  isGroupDragActive: boolean
  suppressExpansionAnimation?: boolean
  shouldMeasureGrid: boolean
  onGridWidthChange?: (width: number | null) => void
  onGroupReorderDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onGroupReorderDrop: (event: React.DragEvent<HTMLDivElement>) => void
  onCardDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onCardDrop: (event: React.DragEvent<HTMLDivElement>) => void
  onInsertZoneDragOver: (event: React.DragEvent<HTMLDivElement>, position: "before" | "after") => void
  onInsertZoneDrop: (event: React.DragEvent<HTMLDivElement>, position: "before" | "after") => void
  header: React.ReactNode
  addButton: React.ReactNode
  children: React.ReactNode
}

export function GroupSection({
  groupName,
  isGroupDragging,
  isGroupDragOver,
  isNewlyCreated,
  isRemoving,
  indicatorPosition,
  showIndicator,
  cardColumnCount,
  isCollapsed,
  isInsertTarget,
  insertPosition,
  isGroupDragActive,
  suppressExpansionAnimation = false,
  shouldMeasureGrid,
  onGridWidthChange,
  onGroupReorderDragOver,
  onGroupReorderDrop,
  onCardDragOver,
  onCardDrop,
  onInsertZoneDragOver,
  onInsertZoneDrop,
  header,
  addButton,
  children,
}: GroupSectionProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const [isContentHiddenVisually, setIsContentHiddenVisually] = useState(isCollapsed)
  const [removalHeight, setRemovalHeight] = useState<number | null>(null)
  const [isRemovalAnimating, setIsRemovalAnimating] = useState(false)
  const removalCollapseRafRef = useRef<number | null>(null)
  const heightMeasureTimeoutRef = useRef<number | null>(null)
  const gridGap = CARD_GRID_GAP

  useEffect(() => {
    if (!shouldMeasureGrid || typeof ResizeObserver === "undefined") {
      return
    }

    const node = gridRef.current
    if (!node) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const width = entry.contentRect.width
      if (width > 0) {
        onGridWidthChange?.(width)
      }
    })

    if (node.clientWidth > 0) {
      onGridWidthChange?.(node.clientWidth)
    }

    observer.observe(node)
    return () => observer.disconnect()
  }, [onGridWidthChange, shouldMeasureGrid])

  const applyContentHeight = useCallback((node: HTMLElement | null) => {
    if (!node) return
    const nextHeight = node.scrollHeight
    setContentHeight((previous) => (previous === nextHeight ? previous : nextHeight))
  }, [])

  const scheduleContentHeightMeasurement = useCallback(
    (node: HTMLElement | null, immediate = false) => {
      if (!node) return
      if (typeof window === "undefined") {
        applyContentHeight(node)
        return
      }
      if (immediate) {
        applyContentHeight(node)
        return
      }
      if (heightMeasureTimeoutRef.current !== null) {
        window.clearTimeout(heightMeasureTimeoutRef.current)
      }
      heightMeasureTimeoutRef.current = window.setTimeout(() => {
        heightMeasureTimeoutRef.current = null
        applyContentHeight(node)
      }, HEIGHT_MEASURE_DEBOUNCE_MS)
    },
    [applyContentHeight],
  )

  useLayoutEffect(() => {
    const node = gridRef.current
    if (!node) return

    scheduleContentHeightMeasurement(node, true)

    if (typeof ResizeObserver === "undefined") {
      if (typeof window === "undefined") {
        return
      }
      const handleResize = () => {
        scheduleContentHeightMeasurement(gridRef.current)
      }
      window.addEventListener("resize", handleResize)
      return () => {
        window.removeEventListener("resize", handleResize)
        if (heightMeasureTimeoutRef.current !== null) {
          window.clearTimeout(heightMeasureTimeoutRef.current)
          heightMeasureTimeoutRef.current = null
        }
      }
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      scheduleContentHeightMeasurement(entry.target as HTMLElement)
    })
    observer.observe(node)

    return () => {
      observer.disconnect()
      if (heightMeasureTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(heightMeasureTimeoutRef.current)
        heightMeasureTimeoutRef.current = null
      }
    }
  }, [scheduleContentHeightMeasurement])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    if (!isCollapsed) {
      const rafId = window.requestAnimationFrame(() => {
        setIsContentHiddenVisually(false)
      })
      return () => {
        window.cancelAnimationFrame(rafId)
      }
    }

    const timeoutId = window.setTimeout(() => {
      setIsContentHiddenVisually(true)
    }, GROUP_SECTION_ANIMATION_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isCollapsed])

  const gridStyle = useMemo<React.CSSProperties>(() => {
    const columns = Math.max(1, cardColumnCount)
    return {
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      justifyContent: "flex-start",
      justifyItems: "stretch",
      overflowAnchor: "none",
      gap: `${gridGap}px`,
    }
  }, [cardColumnCount, gridGap])

  const swapOutlineStyle = useMemo<React.CSSProperties>(
    () => ({
      top: -GROUP_SECTION_METRICS.swapOutset.top,
      bottom: -GROUP_SECTION_METRICS.swapOutset.bottom,
      left: -GROUP_SECTION_METRICS.swapOutset.horizontal,
      right: -GROUP_SECTION_METRICS.swapOutset.horizontal,
      borderRadius: GROUP_SECTION_METRICS.swapRadius,
    }),
    [],
  )

  const beforeZoneStyle = useMemo<React.CSSProperties>(
    () => ({
      top: -GROUP_SECTION_METRICS.insertGap,
      left: -GROUP_SECTION_METRICS.insertHorizontalOutset,
      right: -GROUP_SECTION_METRICS.insertHorizontalOutset,
      height: GROUP_SECTION_METRICS.insertGap,
      pointerEvents: isGroupDragActive ? "auto" : "none",
    }),
    [isGroupDragActive],
  )

  const afterZoneStyle = useMemo<React.CSSProperties>(
    () => ({
      bottom: -GROUP_SECTION_METRICS.insertGap,
      left: -GROUP_SECTION_METRICS.insertHorizontalOutset,
      right: -GROUP_SECTION_METRICS.insertHorizontalOutset,
      height: GROUP_SECTION_METRICS.insertGap,
      pointerEvents: isGroupDragActive ? "auto" : "none",
    }),
    [isGroupDragActive],
  )

  const insertIndicatorBeforeStyle = useMemo<React.CSSProperties>(
    () => ({
      top:
        GROUP_SECTION_METRICS.insertGap -
        GROUP_SECTION_METRICS.insertIndicatorOffsetTop -
        GROUP_SECTION_METRICS.insertThickness / 2,
      height: GROUP_SECTION_METRICS.insertThickness,
      left:
        GROUP_SECTION_METRICS.insertHorizontalOutset -
        GROUP_SECTION_METRICS.insertIndicatorExtraWidth,
      right:
        GROUP_SECTION_METRICS.insertHorizontalOutset -
        GROUP_SECTION_METRICS.insertIndicatorExtraWidth,
    }),
    [],
  )

  const insertIndicatorAfterStyle = useMemo<React.CSSProperties>(
    () => ({
      top:
        GROUP_SECTION_METRICS.insertIndicatorOffsetBottom -
        GROUP_SECTION_METRICS.insertThickness / 2,
      height: GROUP_SECTION_METRICS.insertThickness,
      left:
        GROUP_SECTION_METRICS.insertHorizontalOutset -
        GROUP_SECTION_METRICS.insertIndicatorExtraWidth,
      right:
        GROUP_SECTION_METRICS.insertHorizontalOutset -
        GROUP_SECTION_METRICS.insertIndicatorExtraWidth,
    }),
    [],
  )

  const collapsibleContentStyle = useMemo<React.CSSProperties>(() => {
    const targetHeight = contentHeight === null ? null : Math.max(0, isCollapsed ? 0 : contentHeight)
    const disableExpansionAnimation = suppressExpansionAnimation && !isCollapsed
    const transitionValue =
      contentHeight === null || disableExpansionAnimation
        ? undefined
        : `height ${GROUP_SECTION_ANIMATION_MS}ms cubic-bezier(0.32, 0.72, 0, 1), opacity ${GROUP_SECTION_ANIMATION_MS}ms ease, transform ${GROUP_SECTION_ANIMATION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`
    return {
      height: targetHeight === null ? undefined : `${targetHeight}px`,
      opacity: isCollapsed ? 0 : 1,
      overflow: "hidden",
      pointerEvents: isCollapsed ? "none" : "auto",
      visibility: isContentHiddenVisually ? "hidden" : "visible",
      transform: isCollapsed || disableExpansionAnimation ? (isCollapsed ? "scaleY(0.92)" : "scaleY(1)") : "scaleY(1)",
      transformOrigin: "top center",
      transition: transitionValue,
      willChange: contentHeight === null || disableExpansionAnimation ? undefined : "height, opacity, transform",
    }
  }, [contentHeight, isCollapsed, isContentHiddenVisually, suppressExpansionAnimation])

  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    if (!isRemoving) {
      if (removalCollapseRafRef.current !== null) {
        window.cancelAnimationFrame(removalCollapseRafRef.current)
        removalCollapseRafRef.current = null
      }
      setRemovalHeight(null)
      setIsRemovalAnimating(false)
      return
    }

    const node = rootRef.current
    if (!node) {
      return
    }

    const height = node.getBoundingClientRect().height
    setRemovalHeight(height)
    setIsRemovalAnimating(true)

    if (removalCollapseRafRef.current !== null) {
      window.cancelAnimationFrame(removalCollapseRafRef.current)
    }

    removalCollapseRafRef.current = window.requestAnimationFrame(() => {
      setRemovalHeight(0)
      removalCollapseRafRef.current = null
    })

    return () => {
      if (removalCollapseRafRef.current !== null) {
        window.cancelAnimationFrame(removalCollapseRafRef.current)
        removalCollapseRafRef.current = null
      }
    }
  }, [isRemoving])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && removalCollapseRafRef.current !== null) {
        window.cancelAnimationFrame(removalCollapseRafRef.current)
        removalCollapseRafRef.current = null
      }
    }
  }, [])

  const removalStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!isRemovalAnimating) {
      return undefined
    }

    const transitionDuration = `${GROUP_SECTION_ANIMATION_MS}ms`
    return {
      overflow: "hidden",
      maxHeight: removalHeight === null ? undefined : `${removalHeight}px`,
      opacity: removalHeight === 0 ? 0 : 1,
      transition: `max-height ${transitionDuration} cubic-bezier(0.32, 0.72, 0, 1), opacity ${Math.max(
        0,
        GROUP_SECTION_ANIMATION_MS - 60,
      )}ms ease`,
    }
  }, [isRemovalAnimating, removalHeight])

  return (
    <div
      ref={rootRef}
      className={`relative overflow-visible rounded-lg border border-border/50 bg-background p-3 transition ${
        isGroupDragging ? "opacity-50" : "opacity-100"
      } ${isNewlyCreated ? "animate-in fade-in-0 slide-in-from-top-4 duration-300" : ""} ${
        isRemoving ? "pointer-events-none" : ""
      }`}
      style={removalStyle}
      data-group-section=""
      data-group-name={groupName}
      onDragOver={onGroupReorderDragOver}
      onDrop={onGroupReorderDrop}
    >
      <div
        className="absolute z-20"
        style={beforeZoneStyle}
        onDragOver={(event) => onInsertZoneDragOver(event, "before")}
        onDragEnter={(event) => onInsertZoneDragOver(event, "before")}
        onDrop={(event) => onInsertZoneDrop(event, "before")}
      >
        {isInsertTarget && insertPosition === "before" ? (
          <div className="absolute left-0 right-0 rounded-full bg-blue-500" style={insertIndicatorBeforeStyle} />
        ) : null}
      </div>

      <div
        className="absolute z-20"
        style={afterZoneStyle}
        onDragOver={(event) => onInsertZoneDragOver(event, "after")}
        onDragEnter={(event) => onInsertZoneDragOver(event, "after")}
        onDrop={(event) => onInsertZoneDrop(event, "after")}
      >
        {isInsertTarget && insertPosition === "after" ? (
          <div className="absolute left-0 right-0 rounded-full bg-blue-500" style={insertIndicatorAfterStyle} />
        ) : null}
      </div>

      {isGroupDragOver ? (
        <div className="pointer-events-none absolute z-30 border-[3px] border-dashed border-blue-500" style={swapOutlineStyle} />
      ) : null}

      <div className="flex items-center justify-between" data-group-header="">
        {header}
      </div>

      <div
        aria-hidden={isCollapsed}
        className={`relative overflow-hidden ${isCollapsed ? "mt-0" : "mt-3"}`}
        style={collapsibleContentStyle}
      >
        <div
          ref={gridRef}
          className="relative grid"
          style={gridStyle}
          onDragOver={(event) => {
            event.preventDefault()
            onCardDragOver(event)
          }}
          onDrop={onCardDrop}
        >
          {showIndicator && indicatorPosition ? (
            <div
              className="pointer-events-none absolute z-40 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all"
              style={{
                left: indicatorPosition.left,
                top: indicatorPosition.top,
                height: indicatorPosition.height,
              }}
            />
          ) : null}

          {children}
          {addButton}
        </div>
      </div>
    </div>
  )
}
