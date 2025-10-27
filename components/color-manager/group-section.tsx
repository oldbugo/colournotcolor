"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import type { DragIndicatorPosition } from "@/components/color-manager/types"

type GroupSectionProps = {
  isGroupDragging: boolean
  isGroupDragOver: boolean
  isNewlyCreated: boolean
  isRemoving: boolean
  indicatorPosition: DragIndicatorPosition | null
  showIndicator: boolean
  targetCardWidth: number
  minCardWidth: number
  onGroupReorderDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onGroupReorderDrop: (event: React.DragEvent<HTMLDivElement>) => void
  onCardDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onCardDrop: (event: React.DragEvent<HTMLDivElement>) => void
  header: React.ReactNode
  addButton: React.ReactNode
  children: React.ReactNode
}

export function GroupSection({
  isGroupDragging,
  isGroupDragOver,
  isNewlyCreated,
  isRemoving,
  indicatorPosition,
  showIndicator,
  targetCardWidth,
  minCardWidth,
  onGroupReorderDragOver,
  onGroupReorderDrop,
  onCardDragOver,
  onCardDrop,
  header,
  addButton,
  children,
}: GroupSectionProps) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [columnCount, setColumnCount] = useState(1)
  const gridGap = 12
  const minColumns = 1
  const maxColumns = 8

  useEffect(() => {
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
  }, [gridGap, targetCardWidth, minCardWidth, minColumns, maxColumns])
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

  return (
    <div
      className={`space-y-3 rounded-lg border border-border/50 bg-background p-3 transition ${
        isGroupDragging ? "opacity-50" : "opacity-100"
      } ${isNewlyCreated ? "animate-in fade-in-0 slide-in-from-top-4 duration-300" : ""} ${
        isRemoving ? "animate-out fade-out-0 slide-out-to-top-2 duration-200" : ""
      }`}
      onDragOver={onGroupReorderDragOver}
      onDrop={onGroupReorderDrop}
    >
      <div className="flex items-center justify-between">{header}</div>

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

        {isGroupDragOver && (
          <div className="absolute inset-x-0 -top-3 h-1 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]" />
        )}

        {children}
        {addButton}
      </div>
    </div>
  )
}
