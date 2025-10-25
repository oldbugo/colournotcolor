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
  onGroupReorderDragOver,
  onGroupReorderDrop,
  onCardDragOver,
  onCardDrop,
  header,
  addButton,
  children,
}: GroupSectionProps) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [gridDimensions, setGridDimensions] = useState<{ columns: number; cardWidth: number }>({
    columns: 1,
    cardWidth: 256,
  })

  const cardMinWidth = 156
  const cardMaxWidth = 256
  const gridGap = 12

  useEffect(() => {
    const node = gridRef.current
    if (!node || typeof ResizeObserver === "undefined") return

    const calculateLayout = () => {
      const containerWidth = node.clientWidth
      if (containerWidth <= 0) return

      const maxColumns = Math.max(1, Math.floor((containerWidth + gridGap) / (cardMinWidth + gridGap)))

      let selectedColumns = 1
      let selectedWidth = containerWidth
      let foundIdeal = false
      let fallbackSmall: { columns: number; width: number } | null = null

      for (let columns = 1; columns <= maxColumns; columns += 1) {
        const width = (containerWidth - gridGap * (columns - 1)) / columns

        if (width >= cardMinWidth && width <= cardMaxWidth) {
          selectedColumns = columns
          selectedWidth = width
          foundIdeal = true
          break
        }

        if (width < cardMinWidth) {
          fallbackSmall = { columns, width }
          break
        }
      }

      if (!foundIdeal) {
        if (fallbackSmall) {
          selectedColumns = fallbackSmall.columns
          selectedWidth = fallbackSmall.width
        } else {
          selectedColumns = maxColumns
          selectedWidth = (containerWidth - gridGap * (selectedColumns - 1)) / selectedColumns
        }
      }

      if (selectedColumns === 1 && containerWidth < cardMinWidth) {
        selectedWidth = containerWidth
      }

      setGridDimensions((prev) => {
        const roundedWidth = Math.round(selectedWidth * 100) / 100
        if (prev.columns === selectedColumns && prev.cardWidth === roundedWidth) {
          return prev
        }
        return { columns: selectedColumns, cardWidth: roundedWidth }
      })
    }

    calculateLayout()

    const observer = new ResizeObserver(() => {
      calculateLayout()
    })

    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [cardMinWidth, cardMaxWidth, gridGap])

  const gridStyle = useMemo<React.CSSProperties>(
    () => ({
      gridTemplateColumns: `repeat(${gridDimensions.columns}, minmax(${gridDimensions.cardWidth}px, ${gridDimensions.cardWidth}px))`,
      justifyContent: "flex-start",
      justifyItems: "stretch",
      overflowAnchor: "none",
      gap: `${gridGap}px`,
    }),
    [gridDimensions.columns, gridDimensions.cardWidth, gridGap],
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
