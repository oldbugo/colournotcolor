"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import type { DragIndicatorPosition } from "@/components/color-manager/types"
import { CARD_GRID_GAP, CARD_MAX_GRID_COLUMNS } from "@/lib/design-tokens"

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
  insertIndicatorOffsetTop: 18,
  insertIndicatorOffsetBottom: 28,
  insertMidpointDeadzone: 12,
  edgeInsertThreshold: 28,
  horizontalDetectionOutset: 40,
} as const

type GroupSectionProps = {
  groupName: string
  isGroupDragging: boolean
  isGroupDragOver: boolean
  isNewlyCreated: boolean
  isRemoving: boolean
  indicatorPosition: DragIndicatorPosition | null
  showIndicator: boolean
  targetCardWidth: number
  minCardWidth: number
  isCollapsed: boolean
  isInsertTarget: boolean
  insertPosition: "before" | "after" | null
  isGroupDragActive: boolean
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
  targetCardWidth,
  minCardWidth,
  isCollapsed,
  isInsertTarget,
  insertPosition,
  isGroupDragActive,
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
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [columnCount, setColumnCount] = useState(1)
  const gridGap = CARD_GRID_GAP
  const minColumns = 1
  const maxColumns = CARD_MAX_GRID_COLUMNS

  useEffect(() => {
    if (isCollapsed) return

    const node = gridRef.current
    if (!node || typeof ResizeObserver === "undefined") return

    const deriveColumns = (width: number) => {
      if (width <= 0) return

      const maxFitColumns = Math.max(minColumns, Math.floor((width + gridGap) / (minCardWidth + gridGap)))
      let columns = Math.max(
        minColumns,
        Math.floor((width + gridGap) / (targetCardWidth + gridGap)),
      )
      columns = Math.min(columns, maxColumns, maxFitColumns)
      if (columns < minColumns) {
        columns = minColumns
      }

      let widthPerColumn = (width - gridGap * (columns - 1)) / columns

      while (columns > minColumns && widthPerColumn < minCardWidth) {
        columns -= 1
        widthPerColumn = (width - gridGap * (columns - 1)) / columns
      }

      setColumnCount((prev) => (prev === columns ? prev : columns))
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      deriveColumns(entry.contentRect.width)
    })

    deriveColumns(node.clientWidth)
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [gridGap, targetCardWidth, minCardWidth, minColumns, maxColumns, isCollapsed])

  const gridStyle = useMemo<React.CSSProperties>(
    () => ({
      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
      justifyContent: "flex-start",
      justifyItems: "stretch",
      overflowAnchor: "none",
      gap: `${gridGap}px`,
    }),
    [columnCount, gridGap],
  )

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
    }),
    [],
  )

  const insertIndicatorAfterStyle = useMemo<React.CSSProperties>(
    () => ({
      top:
        GROUP_SECTION_METRICS.insertIndicatorOffsetBottom -
        GROUP_SECTION_METRICS.insertThickness / 2,
      height: GROUP_SECTION_METRICS.insertThickness,
    }),
    [],
  )

  return (
    <div
      className={`relative overflow-visible rounded-lg border border-border/50 bg-background p-3 transition ${
        isCollapsed ? "space-y-1" : "space-y-3"
      } ${isGroupDragging ? "opacity-50" : "opacity-100"} ${
        isNewlyCreated ? "animate-in fade-in-0 slide-in-from-top-4 duration-300" : ""
      } ${isRemoving ? "animate-out fade-out-0 slide-out-to-top-2 duration-200" : ""}`}
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

      <div className="flex items-center justify-between">{header}</div>

      {!isCollapsed ? (
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
      ) : null}
    </div>
  )
}
