"use client"

import { DropIndicator } from "@/components/dnd/drop-indicator"
import { DRAG_SETTLE_DURATION_MS, DRAG_SETTLE_EASING } from "@/components/dnd/timings"
import { CARD_SIZE, BORDER_GAP, GAP_SIZE } from "@/components/contrast-grid/constants"
import { Button } from "@/components/ui/button"
import { DragHandle } from "@/components/ui/drag-handle"
import { composeLabel } from "@/lib/color-utils"
import { foregroundSlotId } from "@/lib/dnd-utils"
import type { ColorSwatch } from "@/types/palette"
import { useDroppable } from "@dnd-kit/core"
import { useSortable } from "@dnd-kit/sortable"
import { Plus } from "lucide-react"
import type React from "react"

type SortableColumnProps = {
  swatch: ColorSwatch
  index: number
  isDropTarget: boolean
  dropMode: "swap" | "before" | "after" | null
  recentlyMoved: boolean
  hoveredIndex: number | null
  editingIndex: number | null
  registerHeaderRef: (index: number, node: HTMLDivElement | null) => void
  onHoverChange: (index: number | null) => void
  onHeaderClick: (index: number, event: React.MouseEvent<HTMLDivElement>) => void
  getAnimationStyle: (index: number) => React.CSSProperties
  sortableId: string
}

function SortableColumn({
  swatch,
  index,
  isDropTarget,
  dropMode,
  recentlyMoved,
  hoveredIndex,
  editingIndex,
  registerHeaderRef,
  onHoverChange,
  onHeaderClick,
  getAnimationStyle,
  sortableId,
}: SortableColumnProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: sortableId,
    data: { type: "foreground", index },
  })

  const { setNodeRef: setBeforeSlotRef } = useDroppable({
    id: foregroundSlotId(sortableId, "before"),
    data: {
      type: "slot",
      slotType: "foreground",
      insertIndex: index,
      targetId: sortableId,
      dropMode: "before",
    },
  })

  const { setNodeRef: setAfterSlotRef } = useDroppable({
    id: foregroundSlotId(sortableId, "after"),
    data: {
      type: "slot",
      slotType: "foreground",
      insertIndex: index + 1,
      targetId: sortableId,
      dropMode: "after",
    },
  })

  const isEditing = editingIndex === index
  const displayText = composeLabel(swatch.name, swatch.group, swatch.hex) || swatch.hex
  const hexColor = swatch.hex
  const slotGapReach = Math.max(GAP_SIZE / 2 + 12, 24)
  const slotInnerWidth = 36
  const slotWidth = slotGapReach + slotInnerWidth
  const style: React.CSSProperties = {
    transition: `box-shadow ${DRAG_SETTLE_DURATION_MS}ms ${DRAG_SETTLE_EASING}`,
    boxShadow: isDropTarget
      ? "0 0 0 3px rgba(59,130,246,0.45)"
      : recentlyMoved
        ? "0 0 0 2px rgba(59,130,246,0.25)"
        : "0 0 0 0 rgba(0,0,0,0)",
  }

  return (
    <div
      key={swatch.id}
      ref={(node) => {
        registerHeaderRef(index, node)
        setNodeRef(node)
      }}
      className="relative flex items-center flex-col transition-all duration-200 overflow-visible"
      style={{
        opacity: isDragging ? 0.5 : 1,
        ...getAnimationStyle(index),
        ...(style || {}),
      }}
      data-color-card
    >
      <div
        ref={setBeforeSlotRef}
        className="pointer-events-none absolute"
        style={{
          top: -GAP_SIZE,
          bottom: -GAP_SIZE,
          left: -slotGapReach,
          width: slotWidth,
        }}
      />

      <div
        ref={setAfterSlotRef}
        className="pointer-events-none absolute"
        style={{
          top: -GAP_SIZE,
          bottom: -GAP_SIZE,
          right: -slotGapReach,
          width: slotWidth,
        }}
      />

      {isEditing && (
        <div
          className="absolute border-2 border-dashed border-gray-400 rounded-lg pointer-events-none z-20"
          style={{ inset: `-${BORDER_GAP}px` }}
        />
      )}

      <DragHandle
        variant="inline"
        className="mb-1"
        data-drag-handle
        onMouseEnter={() => onHoverChange(index)}
        onMouseLeave={() => onHoverChange(null)}
        {...attributes}
        {...listeners}
      />

      <div
        className="flex flex-col items-center justify-end border-2 transition-all cursor-pointer hover:opacity-90 border-border rounded-sm pb-0"
        style={{
          height: `${CARD_SIZE}px`,
          width: `${CARD_SIZE}px`,
          backgroundColor: hexColor,
        }}
        onClick={(event) => onHeaderClick(index, event)}
      >
        <div className="w-full py-2 px-2">
          <div className="rounded bg-white font-mono text-black truncate text-center px-2 my-0 text-sm rounded-sm border py-1 font-light leading-7">
            {displayText}
          </div>
        </div>
      </div>

      <DropIndicator active={isDropTarget} mode={dropMode} orientation="horizontal" className="z-20" gap={GAP_SIZE} />

      {hoveredIndex === index && (
        <div className="absolute -inset-1 bg-gray-400/20 rounded-lg pointer-events-none z-10" />
      )}
    </div>
  )
}

const EmptyForegroundSlot = () => {
  const { setNodeRef, isOver } = useDroppable({
    id: foregroundSlotId("empty-foreground", "before"),
    data: {
      type: "slot",
      slotType: "foreground",
      insertIndex: 0,
      targetId: null,
      dropMode: "before",
    },
  })

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center rounded-lg border-2 border-dashed transition-all duration-200 ${
        isOver ? "border-blue-500 bg-blue-100/60 shadow-lg" : "border-border/60 bg-transparent"
      }`}
      style={{ height: `${CARD_SIZE}px`, width: `${CARD_SIZE}px` }}
    >
      <span className="px-4 text-center text-sm font-medium text-muted-foreground">Drop to add a foreground</span>
    </div>
  )
}

type ForegroundHeaderProps = {
  dragOverId: string | null
  recentlyMovedId: string | null
  dropMode: "swap" | "before" | "after" | null
  hoveredIndex: number | null
  editingIndex: number | null
  registerHeaderRef: (index: number, node: HTMLDivElement | null) => void
  onHoverChange: (index: number | null) => void
  onHeaderClick: (index: number, event: React.MouseEvent<HTMLDivElement>) => void
  onAddColor?: () => void
  getAnimationStyle: (index: number) => React.CSSProperties
  columns: Array<{
    id: string
    swatch: ColorSwatch
  }>
}

export function ForegroundHeader({
  dragOverId,
  recentlyMovedId,
  dropMode,
  hoveredIndex,
  editingIndex,
  registerHeaderRef,
  onHoverChange,
  onHeaderClick,
  onAddColor,
  getAnimationStyle,
  columns,
}: ForegroundHeaderProps) {
  return (
    <>
      {columns.length === 0 ? <EmptyForegroundSlot /> : null}
      {columns.map((column, index) => (
        <SortableColumn
          key={column.id}
          swatch={column.swatch}
          index={index}
          isDropTarget={dragOverId === column.id}
          dropMode={dragOverId === column.id ? dropMode : null}
          recentlyMoved={recentlyMovedId === column.id}
          hoveredIndex={hoveredIndex}
          editingIndex={editingIndex}
          registerHeaderRef={registerHeaderRef}
          onHoverChange={onHoverChange}
          onHeaderClick={onHeaderClick}
          getAnimationStyle={getAnimationStyle}
          sortableId={column.id}
        />
      ))}

      <div className="relative flex items-center flex-col">
        <div className="mb-1 flex cursor-grab active:cursor-grabbing flex-col gap-1 rounded p-2 opacity-0 pointer-events-none">
          <div className="h-0.5 w-8 rounded-full bg-foreground/40" />
          <div className="h-0.5 w-8 rounded-full bg-foreground/40" />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="bg-transparent cursor-pointer border-2 border-border hover:bg-foreground/5 rounded-sm"
          style={{ height: `${CARD_SIZE}px`, width: `${CARD_SIZE}px` }}
          onClick={onAddColor}
        >
          <Plus className="h-8 w-8 text-border" />
        </Button>
      </div>
    </>
  )
}


