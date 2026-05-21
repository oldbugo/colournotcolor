"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"

import { updateSwatch } from "@/lib/color-utils"
import { computeDragMode, computeInsertTargetIndex } from "@/lib/index-dnd"
import type { ColorSwatch } from "@/types/palette"

export type CardDragMode = "swap" | "insert"
export type CardInsertPosition = "before" | "after"

type SnapTrigger = (
  fromIndex: number,
  toIndex: number,
  groupName: string,
  options: { isCrossGroup: boolean },
) => void

type UseCardDndOptions = {
  swatches: ColorSwatch[]
  cardRefs: React.MutableRefObject<Map<number, HTMLDivElement>>
  /** Display label for an "ungrouped" bucket (e.g. "Ungrouped"). Used as the snap target when target.group is null. */
  ungroupedLabel: string
  onBatchUpdateColors: (swatches: ColorSwatch[]) => void
  onColorEdit?: (index: number) => void
  triggerCardSnapIllusion: SnapTrigger
  /** Called on every drag event so the consumer can record pointer position. */
  updatePointer: (event: { clientX: number; clientY: number }) => void
  /** Called when the hook clears its own drag state, so the consumer can reset sibling state (drop zones, leave timers). */
  onResetSiblings?: () => void
  /** Optional override for the auto-clear delay of justDropped (ms). */
  droppedFlashDurationMs?: number
}

export type UseCardDndResult = {
  // ---- state ----
  draggedIndex: number | null
  dragOverIndex: number | null
  dragMode: CardDragMode | null
  insertPosition: CardInsertPosition | null
  dragOverGroup: string | null
  isAnyCardDragging: boolean
  justDropped: boolean
  droppedAtIndex: number | null

  // ---- imperative ----
  /** Flag an external successful drop (e.g. new-group creation) for the post-drop visual flash. */
  markDropped: (index: number) => void
  /** Reset all card-drag state and remove the drag image clone. */
  resetCardDrag: () => void

  // ---- handlers ----
  handleDragStart: (e: React.DragEvent, index: number) => void
  handleDragOver: (e: React.DragEvent, index: number) => void
  handleDragOverGroup: (e: React.DragEvent, groupName: string) => void
  handleDragLeave: () => void
  handleDrop: (e: React.DragEvent) => void
  handleDragEnd: () => void
  handleInsertZoneHover: (
    targetIndex: number,
    targetGroup: string,
    position: CardInsertPosition,
  ) => void
  handleInsertZoneLeave: () => void
}

const DEFAULT_DROPPED_FLASH_MS = 500

/**
 * Encapsulate ColorManager's card-level drag-and-drop:
 *   - drag-image cloning + setDragImage
 *   - intent tracking (swap vs insert + before/after)
 *   - swap/insert mutation against the swatches array
 *   - the brief "just dropped" visual flash and its auto-clear
 *
 * Group-level drag, drop-zone state, and the snap/illusion engine stay with
 * the consumer — passed in via callbacks.
 */
export function useCardDnd({
  swatches,
  cardRefs,
  ungroupedLabel,
  onBatchUpdateColors,
  onColorEdit,
  triggerCardSnapIllusion,
  updatePointer,
  onResetSiblings,
  droppedFlashDurationMs = DEFAULT_DROPPED_FLASH_MS,
}: UseCardDndOptions): UseCardDndResult {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dragMode, setDragMode] = useState<CardDragMode | null>(null)
  const [insertPosition, setInsertPosition] = useState<CardInsertPosition | null>(null)
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null)
  const [isAnyCardDragging, setIsAnyCardDragging] = useState(false)
  const [justDropped, setJustDropped] = useState(false)
  const [droppedAtIndex, setDroppedAtIndex] = useState<number | null>(null)

  const dragImageRef = useRef<HTMLDivElement | null>(null)

  // Stash latest callbacks/options through refs so the returned handlers stay
  // identity-stable while still observing current values.
  const updatePointerRef = useRef(updatePointer)
  const onResetSiblingsRef = useRef(onResetSiblings)
  const onColorEditRef = useRef(onColorEdit)
  const onBatchUpdateColorsRef = useRef(onBatchUpdateColors)
  const triggerCardSnapIllusionRef = useRef(triggerCardSnapIllusion)
  const swatchesRef = useRef(swatches)
  const ungroupedLabelRef = useRef(ungroupedLabel)
  useEffect(() => {
    updatePointerRef.current = updatePointer
    onResetSiblingsRef.current = onResetSiblings
    onColorEditRef.current = onColorEdit
    onBatchUpdateColorsRef.current = onBatchUpdateColors
    triggerCardSnapIllusionRef.current = triggerCardSnapIllusion
    swatchesRef.current = swatches
    ungroupedLabelRef.current = ungroupedLabel
  })

  const removeDragImage = useCallback(() => {
    if (dragImageRef.current && typeof document !== "undefined") {
      try {
        document.body.removeChild(dragImageRef.current)
      } catch {
        // ignore if already detached
      }
    }
    dragImageRef.current = null
  }, [])

  const resetCardDrag = useCallback(() => {
    setDraggedIndex(null)
    setDragOverIndex(null)
    setDragMode(null)
    setInsertPosition(null)
    setDragOverGroup(null)
    setIsAnyCardDragging(false)
    removeDragImage()
    onResetSiblingsRef.current?.()
  }, [removeDragImage])

  const markDropped = useCallback((index: number) => {
    setDroppedAtIndex(index)
    setJustDropped(true)
  }, [])

  // Auto-clear the "just dropped" flash after the configured duration.
  useEffect(() => {
    if (!justDropped) return
    const timer = setTimeout(() => {
      setJustDropped(false)
      setDroppedAtIndex(null)
    }, droppedFlashDurationMs)
    return () => clearTimeout(timer)
  }, [justDropped, droppedFlashDurationMs])

  // Drop image cleanup on unmount.
  useEffect(() => removeDragImage, [removeDragImage])

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      updatePointerRef.current(e)
      removeDragImage()

      setDraggedIndex(index)
      setIsAnyCardDragging(true)
      e.dataTransfer.effectAllowed = "move"

      const card = cardRefs.current.get(index)
      if (card && typeof window !== "undefined") {
        const rect = card.getBoundingClientRect()
        const clone = card.cloneNode(true) as HTMLDivElement
        clone.style.position = "absolute"
        clone.style.top = "-9999px"
        clone.style.left = "-9999px"
        clone.style.width = `${rect.width}px`
        clone.style.height = `${rect.height}px`
        clone.style.pointerEvents = "none"
        clone.style.boxShadow = window.getComputedStyle(card).boxShadow
        document.body.appendChild(clone)
        dragImageRef.current = clone
        const offsetX = e.clientX - rect.left
        const offsetY = e.clientY - rect.top
        e.dataTransfer.setDragImage(clone, offsetX, offsetY)
      }

      onColorEditRef.current?.(-1)
    },
    [cardRefs, removeDragImage],
  )

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    updatePointerRef.current(e)
    e.preventDefault()

    setDraggedIndex((current) => {
      if (current === null || current === index) return current
      const rect = e.currentTarget.getBoundingClientRect()
      const pointerRatio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5
      const intent = computeDragMode(pointerRatio)
      setDragMode(intent.mode)
      setInsertPosition(intent.insertPosition)
      setDragOverIndex(index)
      return current
    })
  }, [])

  const handleDragOverGroup = useCallback((e: React.DragEvent, groupName: string) => {
    updatePointerRef.current(e)
    e.preventDefault()
    setDragOverGroup(groupName)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      updatePointerRef.current(e)
      e.preventDefault()

      const currentSwatches = swatchesRef.current
      const fallbackGroupLabel = ungroupedLabelRef.current.toLowerCase()

      if (draggedIndex !== null && dragOverIndex !== null && dragMode === "swap") {
        const draggedSwatch = currentSwatches[draggedIndex]
        const targetSwatch = currentSwatches[dragOverIndex]
        if (draggedSwatch && targetSwatch) {
          const draggedGroup = draggedSwatch.group
          const targetGroup = targetSwatch.group
          const isCrossGroupMove = draggedGroup !== targetGroup

          const newSwatches = [...currentSwatches]
          if (isCrossGroupMove) {
            // Items swap into each other's groups so the visual buckets keep the same positions.
            newSwatches[draggedIndex] = updateSwatch(targetSwatch, { group: draggedGroup })
            newSwatches[dragOverIndex] = updateSwatch(draggedSwatch, { group: targetGroup })
          } else {
            newSwatches[draggedIndex] = targetSwatch
            newSwatches[dragOverIndex] = draggedSwatch
          }

          onBatchUpdateColorsRef.current(newSwatches)
          markDropped(dragOverIndex)
          const destinationGroupLabel = targetGroup ?? fallbackGroupLabel
          triggerCardSnapIllusionRef.current(
            draggedIndex,
            dragOverIndex,
            destinationGroupLabel,
            { isCrossGroup: isCrossGroupMove },
          )
        }
      } else if (
        draggedIndex !== null &&
        dragOverIndex !== null &&
        dragMode === "insert" &&
        insertPosition
      ) {
        const draggedSwatch = currentSwatches[draggedIndex]
        const targetSwatch = currentSwatches[dragOverIndex]
        if (draggedSwatch && targetSwatch) {
          const draggedGroup = draggedSwatch.group
          const targetGroup = targetSwatch.group
          const isCrossGroupMove = draggedGroup !== targetGroup

          const targetIndex = computeInsertTargetIndex({
            draggedIndex,
            dragOverIndex,
            insertPosition,
            length: currentSwatches.length,
          })

          if (targetIndex !== null) {
            const swatchToInsert = isCrossGroupMove
              ? updateSwatch(draggedSwatch, { group: targetGroup })
              : draggedSwatch

            const newSwatches = [...currentSwatches]
            newSwatches.splice(draggedIndex, 1)
            newSwatches.splice(targetIndex, 0, swatchToInsert)

            onBatchUpdateColorsRef.current(newSwatches)
            markDropped(targetIndex)
            const destinationGroupLabel = targetGroup ?? fallbackGroupLabel
            triggerCardSnapIllusionRef.current(
              draggedIndex,
              targetIndex,
              destinationGroupLabel,
              { isCrossGroup: isCrossGroupMove },
            )
          }
        }
      }

      resetCardDrag()
    },
    [draggedIndex, dragOverIndex, dragMode, insertPosition, markDropped, resetCardDrag],
  )

  const handleDragEnd = useCallback(() => {
    resetCardDrag()
  }, [resetCardDrag])

  const handleInsertZoneHover = useCallback(
    (targetIndex: number, targetGroup: string, position: CardInsertPosition) => {
      if (draggedIndex === null) {
        setDragMode(null)
        setInsertPosition(null)
        setDragOverIndex(null)
        setDragOverGroup(null)
        return
      }

      if (draggedIndex === targetIndex) {
        return
      }

      const isAdjacent =
        (draggedIndex === targetIndex - 1 && position === "before") ||
        (draggedIndex === targetIndex + 1 && position === "after")

      if (isAdjacent) {
        return
      }

      if (dragMode === "insert" && insertPosition === position && dragOverIndex === targetIndex) {
        return
      }

      setDragMode("insert")
      setInsertPosition(position)
      setDragOverIndex(targetIndex)
      setDragOverGroup(targetGroup)
    },
    [dragMode, dragOverIndex, draggedIndex, insertPosition],
  )

  const handleInsertZoneLeave = useCallback(() => {
    setDragOverIndex(null)
    setDragMode(null)
    setInsertPosition(null)
  }, [])

  return {
    draggedIndex,
    dragOverIndex,
    dragMode,
    insertPosition,
    dragOverGroup,
    isAnyCardDragging,
    justDropped,
    droppedAtIndex,
    markDropped,
    resetCardDrag,
    handleDragStart,
    handleDragOver,
    handleDragOverGroup,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    handleInsertZoneHover,
    handleInsertZoneLeave,
  }
}
