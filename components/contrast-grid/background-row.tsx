"use client"

import { CARD_SIZE, BORDER_GAP, GAP_SIZE } from "@/components/contrast-grid/constants"
import { DropIndicator } from "@/components/dnd/drop-indicator"
import { DRAG_SETTLE_DURATION_MS, DRAG_SETTLE_EASING } from "@/components/dnd/timings"
import { composeLabel } from "@/lib/color-utils"
import { calculateContrast, getWCAGLevel } from "@/lib/contrast-utils"
import { backgroundSlotId, type DropMode } from "@/lib/dnd-utils"
import { getStatusPillClassName } from "@/lib/status-pill"
import { useDroppable } from "@dnd-kit/core"
import { useSortable } from "@dnd-kit/sortable"
import type { ColorSwatch } from "@/types/palette"

type BackgroundRowProps = {
  index: number
  color: ColorSwatch
  foregroundColors: ColorSwatch[]
  activeColumnId: string | null
  isDropTarget: boolean
  recentlyMoved: boolean
  dropMode: DropMode | null
  hoveredBgIndex: number | null
  editingIndex: number | null
  registerLabelRef: (index: number, node: HTMLDivElement | null) => void
  onHoverChange: (index: number | null) => void
  onHeaderClick: (index: number, event: React.MouseEvent<HTMLDivElement>) => void
  getRowAnimationStyle: (index: number) => React.CSSProperties
  getCellAnimationStyle: (fgIndex: number, bgIndex: number) => React.CSSProperties
}

export function BackgroundRow({
  index,
  color,
  foregroundColors,
  activeColumnId,
  isDropTarget,
  recentlyMoved,
  dropMode,
  hoveredBgIndex,
  editingIndex,
  registerLabelRef,
  onHoverChange,
  onHeaderClick,
  getRowAnimationStyle,
  getCellAnimationStyle,
}: BackgroundRowProps) {
  const sortableId = `bg-${color.id}`
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: sortableId,
    data: { type: "background", index },
  })

  const { setNodeRef: setBeforeSlotRef } = useDroppable({
    id: backgroundSlotId(sortableId, "before"),
    data: {
      type: "slot",
      slotType: "background",
      insertIndex: index,
      targetId: sortableId,
      dropMode: "before",
    },
  })

  const { setNodeRef: setAfterSlotRef } = useDroppable({
    id: backgroundSlotId(sortableId, "after"),
    data: {
      type: "slot",
      slotType: "background",
      insertIndex: index + 1,
      targetId: sortableId,
      dropMode: "after",
    },
  })

  const isRowDragging = isDragging
  const isRowEditing = editingIndex === index
  const bgHexColor = color.hex
  const bgDisplayText = composeLabel(color.name, color.group, color.hex) || color.hex
  const slotGapReach = Math.max(GAP_SIZE / 2 + 12, 24)
  const slotInnerHeight = 36
  const slotHeight = slotGapReach + slotInnerHeight

  const sortableStyle: React.CSSProperties = {
    transition: `box-shadow ${DRAG_SETTLE_DURATION_MS}ms ${DRAG_SETTLE_EASING}`,
  }

  return (
    <>
      <div
        ref={(node) => {
          registerLabelRef(index, node)
          setNodeRef(node)
        }}
        className="relative flex items-center transition-all duration-200 pr-0 mr-0 gap-2 overflow-visible"
      style={{
        opacity: isRowDragging ? 0.5 : 1,
        boxShadow: isDropTarget
          ? "0 0 0 3px rgba(59,130,246,0.45)"
          : recentlyMoved
            ? "0 0 0 2px rgba(59,130,246,0.25)"
            : "0 0 0 0 rgba(0,0,0,0)",
        ...getRowAnimationStyle(index),
        ...sortableStyle,
      }}
      data-color-card
    >
      <div
        ref={setBeforeSlotRef}
        className="pointer-events-none absolute"
        style={{
          left: -GAP_SIZE,
          right: -GAP_SIZE,
          top: -slotGapReach,
          height: slotHeight,
        }}
      />

      <div
        ref={setAfterSlotRef}
        className="pointer-events-none absolute"
        style={{
          left: -GAP_SIZE,
          right: -GAP_SIZE,
          bottom: -slotGapReach,
          height: slotHeight,
        }}
      />
        {isRowEditing && (
          <div
            className="absolute border-2 border-dashed border-gray-400 rounded-lg pointer-events-none z-20"
            style={{ inset: `-${BORDER_GAP}px` }}
          />
        )}

        <div
          onMouseEnter={() => onHoverChange(index)}
          onMouseLeave={() => onHoverChange(null)}
          className="flex cursor-grab active:cursor-grabbing gap-1 rounded p-2 hover:bg-foreground/5"
          data-drag-handle
          {...attributes}
          {...listeners}
        >
          <div className="h-8 w-0.5 rounded-full bg-foreground/40" />
          <div className="h-8 w-0.5 rounded-full bg-foreground/40" />
        </div>

        <div className="flex flex-col items-center gap-1">
          <div
            className="flex flex-col items-center justify-end border-2 border-border transition-all cursor-pointer hover:opacity-90 rounded-sm pb-0"
            style={{ height: `${CARD_SIZE}px`, width: `${CARD_SIZE}px`, backgroundColor: bgHexColor }}
            onClick={(event) => onHeaderClick(index, event)}
          >
            <div className="w-full px-2 py-2">
              <div className="rounded bg-white font-mono text-black px-2 truncate text-center border rounded-sm py-1 text-sm font-light">
                {bgDisplayText}
              </div>
            </div>
          </div>
        </div>

        <DropIndicator active={isDropTarget} mode={dropMode} orientation="vertical" className="z-20" gap={GAP_SIZE} />

        {hoveredBgIndex === index && (
          <div className="absolute -inset-1 bg-gray-400/20 rounded-lg pointer-events-none z-10" />
        )}
      </div>

      {foregroundColors.map((fgColor, fgIndex) => {
        const columnId = `fg-${fgColor.id}`
        const isFgDragging = activeColumnId === columnId
        const fgHexColor = fgColor.hex
        const ratio = calculateContrast(fgHexColor, bgHexColor)
        const level = getWCAGLevel(ratio)

        return (
          <div
            key={`${color.id}-${fgColor.id}`}
            className="relative flex flex-col items-center justify-center border-2 border-border transition-all duration-200 rounded-sm"
            style={{
              height: `${CARD_SIZE}px`,
              width: `${CARD_SIZE}px`,
              backgroundColor: bgHexColor,
              opacity: isFgDragging || isRowDragging ? 0.5 : 1,
              ...getCellAnimationStyle(fgIndex, index),
            }}
          >
            <div className="relative z-10 text-2xl font-bold" style={{ color: fgHexColor }}>
              {ratio.toFixed(2)}
            </div>
            <div className="relative z-10 mt-2 flex gap-1">
              {level.aa && (
                <span className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white">AA</span>
              )}
              {level.aaa && (
                <span className="rounded bg-green-700 px-2 py-0.5 text-xs font-medium text-white">AAA</span>
              )}
              {!level.aa && (
                <span className={getStatusPillClassName("fail", "sm")}>Fail</span>
              )}
            </div>
          </div>
        )
      })}

      <div
        style={{
          height: `${CARD_SIZE}px`,
          width: `${CARD_SIZE}px`,
        }}
      />
    </>
  )
}


