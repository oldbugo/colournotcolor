"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  GROUP_SECTION_ANIMATION_MS,
  GROUP_SECTION_METRICS,
} from "@/components/color-manager/group-section"
import type { ColorWithName } from "@/components/color-manager/types"
import type { Align } from "@/lib/scroll-snap"
import type { ColorSwatch } from "@/types/palette"

export type GroupDragMode = "swap" | "insert"
export type GroupInsertPosition = "before" | "after"

type GroupDragIntentState = {
  groupName: string
  mode: GroupDragMode
  position: GroupInsertPosition | null
  distance: number
}

type GroupDeadzoneLock = {
  groupName: string
  position: GroupInsertPosition
}

type UseGroupDndOptions = {
  swatches: ColorSwatch[]
  /** Output of groupSwatchesByCategory — used both for ordering at drop time and to mark the rect cache dirty. */
  groupedColors: Map<string, ColorWithName[]>
  /** Re-mark the section rect cache dirty when card column count changes. */
  cardColumnCount: number
  /** Whether a card-level drag is currently in progress. Used to install a global dragover listener that keeps the pointer ref fresh. */
  isAnyCardDragging: boolean

  onBatchUpdateColors: (swatches: ColorSwatch[]) => void
  onColorEdit?: (index: number) => void

  /** Resolve a group's section element by name (queried in the DOM). */
  findGroupSectionElement: (groupName: string | null) => HTMLElement | null

  /** Group-anchor handles (provided by useGroupScrollAnchor). */
  queueGroupScrollAnchor: (groupName: string | null) => void
  /** Post-expansion snap (provided by ColorManager's snap orchestrator). */
  requestGroupSnapPostExpansion: (
    groupName: string | null,
    options?: { force?: boolean; align?: Align },
  ) => void

  /** Pointer + global cleanup callbacks owned by ColorManager. */
  updateDragPointerFromEvent: (event: { clientX: number; clientY: number }) => void
  clearGlobalDragPointer: () => void
}

export type UseGroupDndResult = {
  draggedGroup: string | null
  dragOverGroupName: string | null
  groupDragMode: GroupDragMode | null
  groupInsertPosition: GroupInsertPosition | null
  areGroupsCollapsedForDrag: boolean
  suppressGroupExpansionAnimation: boolean

  handleGroupDragStart: (event: React.DragEvent, groupName: string) => void
  handleGroupDragOver: (event: React.DragEvent) => void
  handleGroupInsertZoneDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  handleGroupInsertZoneDrop: (
    event: React.DragEvent<HTMLDivElement>,
    groupName: string,
    position: GroupInsertPosition,
  ) => void
  handleGroupDrop: (
    event: React.DragEvent<HTMLElement>,
    targetGroupName: string,
    overrideIntent?: { mode: GroupDragMode; position?: GroupInsertPosition | null },
  ) => void
  handleGroupDragEnd: () => void
}

/**
 * Group-level drag-and-drop for ColorManager: drag-image cloning, the
 * pointer-driven intent evaluator (swap vs insert before/after with edge
 * thresholds, a midpoint deadzone, and a sticky-direction lock), and the
 * group reorder that emits a new `swatches[]` to the consumer.
 *
 * ColorManager still owns the snap engine and the scroll anchor — they
 * are passed in as callbacks (`queueGroupScrollAnchor`,
 * `requestGroupSnapPostExpansion`).
 */
export function useGroupDnd({
  swatches,
  groupedColors,
  cardColumnCount,
  isAnyCardDragging,
  onBatchUpdateColors,
  onColorEdit,
  findGroupSectionElement,
  queueGroupScrollAnchor,
  requestGroupSnapPostExpansion,
  updateDragPointerFromEvent,
  clearGlobalDragPointer,
}: UseGroupDndOptions): UseGroupDndResult {
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null)
  const [dragOverGroupName, setDragOverGroupName] = useState<string | null>(null)
  const [groupDragMode, setGroupDragMode] = useState<GroupDragMode | null>(null)
  const [groupInsertPosition, setGroupInsertPosition] = useState<GroupInsertPosition | null>(null)
  const [areGroupsCollapsedForDrag, setAreGroupsCollapsedForDrag] = useState(false)
  const [suppressGroupExpansionAnimation, setSuppressGroupExpansionAnimation] = useState(false)

  const draggedGroupRef = useRef<string | null>(null)
  const groupDragPointerRef = useRef<{ x: number; y: number } | null>(null)
  const groupDragImageRef = useRef<HTMLDivElement | null>(null)
  const lastGroupIntentRef = useRef<GroupDragIntentState | null>(null)
  const groupDeadzoneLockRef = useRef<GroupDeadzoneLock | null>(null)
  const groupSectionRectsRef = useRef<Array<{ name: string; rect: DOMRect }>>([])
  const groupSectionRectsDirtyRef = useRef(false)
  const prevGroupsCollapsedRef = useRef(false)
  const suppressExpansionTimeoutRef = useRef<number | null>(null)

  // Mirror latest callbacks/props through refs so the returned handlers are
  // identity-stable while still observing current values.
  const findGroupSectionElementRef = useRef(findGroupSectionElement)
  const queueGroupScrollAnchorRef = useRef(queueGroupScrollAnchor)
  const requestGroupSnapPostExpansionRef = useRef(requestGroupSnapPostExpansion)
  const updateDragPointerFromEventRef = useRef(updateDragPointerFromEvent)
  const clearGlobalDragPointerRef = useRef(clearGlobalDragPointer)
  const onBatchUpdateColorsRef = useRef(onBatchUpdateColors)
  const onColorEditRef = useRef(onColorEdit)
  const swatchesRef = useRef(swatches)
  const groupedColorsRef = useRef(groupedColors)
  useEffect(() => {
    findGroupSectionElementRef.current = findGroupSectionElement
    queueGroupScrollAnchorRef.current = queueGroupScrollAnchor
    requestGroupSnapPostExpansionRef.current = requestGroupSnapPostExpansion
    updateDragPointerFromEventRef.current = updateDragPointerFromEvent
    clearGlobalDragPointerRef.current = clearGlobalDragPointer
    onBatchUpdateColorsRef.current = onBatchUpdateColors
    onColorEditRef.current = onColorEdit
    swatchesRef.current = swatches
    groupedColorsRef.current = groupedColors
  })

  // Mirror draggedGroup → ref (used by group-scroll-anchor consumer too).
  useEffect(() => {
    draggedGroupRef.current = draggedGroup
  }, [draggedGroup])

  // When `areGroupsCollapsedForDrag` flips true → false, briefly suppress the
  // expansion animation so the layout doesn't visibly resnap.
  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const prev = prevGroupsCollapsedRef.current
    prevGroupsCollapsedRef.current = areGroupsCollapsedForDrag
    if (prev && !areGroupsCollapsedForDrag) {
      schedulePostEffect(() => {
        setSuppressGroupExpansionAnimation(true)
        if (suppressExpansionTimeoutRef.current !== null) {
          window.clearTimeout(suppressExpansionTimeoutRef.current)
        }
        suppressExpansionTimeoutRef.current = window.setTimeout(() => {
          setSuppressGroupExpansionAnimation(false)
          suppressExpansionTimeoutRef.current = null
        }, GROUP_SECTION_ANIMATION_MS)
      })
    }
  }, [areGroupsCollapsedForDrag])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && suppressExpansionTimeoutRef.current !== null) {
        window.clearTimeout(suppressExpansionTimeoutRef.current)
        suppressExpansionTimeoutRef.current = null
      }
    }
  }, [])

  // Mark the section rects cache dirty when layout-relevant inputs change.
  useEffect(() => {
    if (!draggedGroup) {
      return
    }
    groupSectionRectsDirtyRef.current = true
  }, [draggedGroup, groupedColors, cardColumnCount, areGroupsCollapsedForDrag])

  const measureGroupSectionRects = useCallback((force = false) => {
    if (!force && !groupSectionRectsDirtyRef.current && groupSectionRectsRef.current.length > 0) {
      return groupSectionRectsRef.current
    }
    if (typeof document === "undefined") {
      return []
    }
    const sections = document.querySelectorAll<HTMLElement>("[data-group-section]")
    const nextRects: Array<{ name: string; rect: DOMRect }> = []
    sections.forEach((section) => {
      const name = section.getAttribute("data-group-name")
      if (!name) {
        return
      }
      nextRects.push({ name, rect: section.getBoundingClientRect() })
    })
    groupSectionRectsRef.current = nextRects
    groupSectionRectsDirtyRef.current = false
    return nextRects
  }, [])

  const applyGroupDragImage = useCallback((event: React.DragEvent, groupName: string) => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return
    }

    const section = findGroupSectionElementRef.current(groupName)
    if (!section) {
      return
    }

    if (groupDragImageRef.current) {
      try {
        document.body.removeChild(groupDragImageRef.current)
      } catch {
        // ignore if detached
      }
      groupDragImageRef.current = null
    }

    const sectionRect = section.getBoundingClientRect()
    if (sectionRect.width === 0 || sectionRect.height === 0) {
      return
    }

    const headerNode = section.querySelector<HTMLElement>("[data-group-header]")
    const headerClone = headerNode ? (headerNode.cloneNode(true) as HTMLElement) : null
    const preview = document.createElement("div")
    const computed = window.getComputedStyle(section)
    preview.className = section.className
    preview.style.width = `${sectionRect.width}px`
    preview.style.maxWidth = `${sectionRect.width}px`
    preview.style.padding = computed.padding
    preview.style.borderRadius = computed.borderRadius
    preview.style.background = computed.backgroundColor || "var(--background)"
    preview.style.boxShadow = computed.boxShadow || "0 12px 25px rgba(15, 23, 42, 0.18)"
    preview.style.position = "absolute"
    preview.style.top = "-9999px"
    preview.style.left = "-9999px"
    preview.style.pointerEvents = "none"
    preview.style.overflow = "hidden"

    if (headerClone) {
      preview.appendChild(headerClone)
    }

    const stub = document.createElement("div")
    stub.style.height = "40px"
    stub.style.marginTop = "8px"
    stub.style.borderRadius = "8px"
    stub.style.background = "linear-gradient(90deg, rgba(226,232,240,0.9), rgba(203,213,225,0.6))"
    stub.style.border = "1px solid rgba(148, 163, 184, 0.35)"
    preview.appendChild(stub)

    document.body.appendChild(preview)
    groupDragImageRef.current = preview

    const rawOffsetX = event.clientX - sectionRect.left
    const rawOffsetY = event.clientY - sectionRect.top
    const headerHeight = headerClone
      ? headerClone.getBoundingClientRect().height || 48
      : headerNode?.getBoundingClientRect().height || 48
    const clampedOffsetX =
      Number.isFinite(rawOffsetX) && sectionRect.width > 0
        ? Math.min(Math.max(rawOffsetX, 16), Math.max(16, sectionRect.width - 16))
        : sectionRect.width / 2
    const clampedOffsetY =
      Number.isFinite(rawOffsetY) && headerHeight > 0
        ? Math.min(Math.max(rawOffsetY, 12), Math.max(12, headerHeight - 6))
        : headerHeight / 2

    try {
      event.dataTransfer.setDragImage(preview, clampedOffsetX, clampedOffsetY)
    } catch {
      // ignore browsers that disallow custom drag previews
    }
  }, [])

  const resetGroupDragState = useCallback(() => {
    if (areGroupsCollapsedForDrag) {
      queueGroupScrollAnchorRef.current(draggedGroupRef.current)
    }
    setDraggedGroup(null)
    setDragOverGroupName(null)
    setAreGroupsCollapsedForDrag(false)
    setGroupDragMode(null)
    setGroupInsertPosition(null)
    groupDragPointerRef.current = null
    groupSectionRectsRef.current = []
    groupSectionRectsDirtyRef.current = false
    clearGlobalDragPointerRef.current()

    if (groupDragImageRef.current && typeof document !== "undefined") {
      try {
        document.body.removeChild(groupDragImageRef.current)
      } catch {
        // ignore if already detached
      }
      groupDragImageRef.current = null
    }
  }, [areGroupsCollapsedForDrag])

  const evaluateGroupDragIntent = useCallback(
    (pointer: { x: number; y: number }) => {
      if (!draggedGroup) return

      const cachedRects =
        groupSectionRectsRef.current.length > 0 && !groupSectionRectsDirtyRef.current
          ? groupSectionRectsRef.current
          : measureGroupSectionRects()
      const sections = cachedRects
      if (sections.length === 0) {
        if (groupDragMode !== null) setGroupDragMode(null)
        if (groupInsertPosition !== null) setGroupInsertPosition(null)
        if (dragOverGroupName !== null) setDragOverGroupName(null)
        return
      }

      const halfGap = GROUP_SECTION_METRICS.insertGap / 2
      const horizontalOutset = GROUP_SECTION_METRICS.horizontalDetectionOutset
      const baseEdgeThreshold = GROUP_SECTION_METRICS.edgeInsertThreshold
      const lastIntent = lastGroupIntentRef.current
      const midpointDeadzone = GROUP_SECTION_METRICS.insertMidpointDeadzone

      let bestIntent: GroupDragIntentState | null = null

      const tolerance = 1.5

      const considerCandidate = (
        groupName: string,
        mode: GroupDragMode,
        position: GroupInsertPosition | null,
        distance: number,
      ) => {
        if (distance < 0) return
        if (mode === "swap" && groupName === draggedGroup) return

        const candidatePosition: GroupInsertPosition | null =
          mode === "insert" ? position ?? "before" : null
        const candidateMatchesCurrent =
          dragOverGroupName === groupName &&
          groupDragMode === mode &&
          (mode !== "insert" || groupInsertPosition === candidatePosition)

        const adoptCandidate = () => {
          bestIntent = {
            groupName,
            mode,
            position: candidatePosition,
            distance,
          }
        }

        if (!bestIntent || distance < bestIntent.distance - tolerance) {
          adoptCandidate()
          return
        }

        if (!bestIntent) return

        const bestMatchesCurrent =
          dragOverGroupName === bestIntent.groupName &&
          groupDragMode === bestIntent.mode &&
          (bestIntent.mode !== "insert" || groupInsertPosition === bestIntent.position)

        if (Math.abs(distance - bestIntent.distance) <= tolerance) {
          if (candidateMatchesCurrent && !bestMatchesCurrent) {
            adoptCandidate()
            return
          }
          if (!bestMatchesCurrent) {
            if (bestIntent.mode === "swap" && mode === "insert") {
              adoptCandidate()
              return
            }
            if (mode === "insert" && groupInsertPosition === candidatePosition) {
              adoptCandidate()
            }
          }
        }
      }

      for (const section of sections) {
        const groupName = section.name
        const rect = section.rect
        const horizontalMin = rect.left - horizontalOutset
        const horizontalMax = rect.right + horizontalOutset
        if (pointer.x < horizontalMin || pointer.x > horizontalMax) continue

        const insideVertical = pointer.y >= rect.top && pointer.y <= rect.bottom
        const distanceAbove = rect.top - pointer.y
        const distanceBelow = pointer.y - rect.bottom
        const topEdgeDistance = pointer.y - rect.top
        const bottomEdgeDistance = rect.bottom - pointer.y
        const edgeThreshold = Math.min(baseEdgeThreshold, rect.height / 2)

        if (insideVertical) {
          const centerLine = rect.top + rect.height / 2
          const distanceToCenter = pointer.y - centerLine
          const absCenterDistance = Math.abs(distanceToCenter)
          const withinDeadzone = midpointDeadzone > 0 && absCenterDistance <= midpointDeadzone
          const currentLock = groupDeadzoneLockRef.current

          if (
            currentLock &&
            currentLock.groupName === groupName &&
            (midpointDeadzone <= 0 || absCenterDistance > midpointDeadzone + GROUP_SECTION_METRICS.insertThickness + 2)
          ) {
            groupDeadzoneLockRef.current = null
          }

          if (withinDeadzone) {
            let handledDeadzone = false
            if (currentLock && currentLock.groupName === groupName) {
              considerCandidate(groupName, "insert", currentLock.position, absCenterDistance)
              handledDeadzone = true
            } else if (
              lastIntent &&
              lastIntent.mode === "insert" &&
              lastIntent.groupName === groupName &&
              lastIntent.position !== null
            ) {
              groupDeadzoneLockRef.current = { groupName, position: lastIntent.position }
              considerCandidate(groupName, "insert", lastIntent.position, absCenterDistance)
              handledDeadzone = true
            }

            if (handledDeadzone) {
              continue
            }
          }

          if (groupDeadzoneLockRef.current?.groupName === groupName) {
            groupDeadzoneLockRef.current = null
          }

          if (topEdgeDistance >= 0 && topEdgeDistance <= edgeThreshold) {
            considerCandidate(groupName, "insert", "before", topEdgeDistance)
          }
          if (bottomEdgeDistance >= 0 && bottomEdgeDistance <= edgeThreshold) {
            considerCandidate(groupName, "insert", "after", bottomEdgeDistance)
          }

          const centerDistance = Math.abs(distanceToCenter)
          considerCandidate(groupName, "swap", null, centerDistance)
        } else {
          if (groupDeadzoneLockRef.current?.groupName === groupName) {
            groupDeadzoneLockRef.current = null
          }
          if (distanceAbove >= 0 && distanceAbove <= halfGap) {
            considerCandidate(groupName, "insert", "before", distanceAbove)
          }
          if (distanceBelow >= 0 && distanceBelow <= halfGap) {
            considerCandidate(groupName, "insert", "after", distanceBelow)
          }
        }
      }

      if (!bestIntent) {
        setDragOverGroupName(null)
        setGroupDragMode(null)
        setGroupInsertPosition(null)
        lastGroupIntentRef.current = null
        return
      }

      const baseIntent = bestIntent as GroupDragIntentState
      let resolvedIntent: GroupDragIntentState = baseIntent
      if (
        lastIntent &&
        resolvedIntent.mode === "insert" &&
        lastIntent.mode === "insert" &&
        resolvedIntent.groupName === lastIntent.groupName &&
        resolvedIntent.position !== null &&
        lastIntent.position !== null
      ) {
        const distanceDelta = Math.abs(resolvedIntent.distance - lastIntent.distance)
        if (distanceDelta <= GROUP_SECTION_METRICS.insertThickness + 2) {
          resolvedIntent = {
            ...resolvedIntent,
            position: lastIntent.position,
            distance: lastIntent.distance,
          }
        }
      }

      const intent: GroupDragIntentState = resolvedIntent

      const nextGroupName = intent.groupName
      const nextMode: GroupDragMode = intent.mode
      const nextInsertPosition: GroupInsertPosition | null =
        intent.mode === "insert" ? intent.position : null

      if (dragOverGroupName !== nextGroupName) {
        setDragOverGroupName(nextGroupName)
      }

      if (groupDragMode !== nextMode) {
        setGroupDragMode(nextMode)
      }

      if (groupInsertPosition !== nextInsertPosition) {
        setGroupInsertPosition(nextInsertPosition)
      }

      lastGroupIntentRef.current = { ...intent }

      if (intent.mode === "insert" && intent.position !== null) {
        groupDeadzoneLockRef.current = { groupName: intent.groupName, position: intent.position }
      } else if (groupDeadzoneLockRef.current?.groupName === intent.groupName) {
        groupDeadzoneLockRef.current = null
      }
    },
    [draggedGroup, dragOverGroupName, groupDragMode, groupInsertPosition, measureGroupSectionRects],
  )

  const syncGroupHoverFromPointer = useCallback(() => {
    const pointer = groupDragPointerRef.current
    if (!pointer) return
    evaluateGroupDragIntent(pointer)
  }, [evaluateGroupDragIntent])

  // Re-sync hover once after groups collapse so the indicator is honest.
  useEffect(() => {
    if (!areGroupsCollapsedForDrag) return
    if (typeof window === "undefined") return

    const frame = window.requestAnimationFrame(() => {
      syncGroupHoverFromPointer()
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [areGroupsCollapsedForDrag, syncGroupHoverFromPointer])

  // While a group drag is active, listen at document level so we keep the
  // pointer ref fresh even when the cursor leaves the dragged section.
  useEffect(() => {
    if (!draggedGroup) return
    if (typeof document === "undefined") return

    const handleGlobalDragOver = (event: DragEvent) => {
      groupDragPointerRef.current = { x: event.clientX, y: event.clientY }
      updateDragPointerFromEventRef.current(event)
      syncGroupHoverFromPointer()
    }

    document.addEventListener("dragover", handleGlobalDragOver)
    return () => {
      document.removeEventListener("dragover", handleGlobalDragOver)
    }
  }, [draggedGroup, syncGroupHoverFromPointer])

  // During a card drag, also keep the pointer ref fresh so the auto-scroll
  // loop has something to read.
  useEffect(() => {
    if (!isAnyCardDragging) return
    if (typeof document === "undefined") return

    const handleCardDragOver = (event: DragEvent) => {
      updateDragPointerFromEventRef.current(event)
    }

    document.addEventListener("dragover", handleCardDragOver)
    return () => {
      document.removeEventListener("dragover", handleCardDragOver)
    }
  }, [isAnyCardDragging])

  const handleGroupDragStart = useCallback(
    (e: React.DragEvent, groupName: string) => {
      onColorEditRef.current?.(-1)
      applyGroupDragImage(e, groupName)
      updateDragPointerFromEventRef.current(e)
      groupDragPointerRef.current = { x: e.clientX, y: e.clientY }
      measureGroupSectionRects(true)
      setDraggedGroup(groupName)
      setGroupDragMode(null)
      setGroupInsertPosition(null)
      queueGroupScrollAnchorRef.current(groupName)
      setAreGroupsCollapsedForDrag(true)
      e.dataTransfer.effectAllowed = "move"
    },
    [applyGroupDragImage, measureGroupSectionRects],
  )

  const handleGroupDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      updateDragPointerFromEventRef.current(e)
      groupDragPointerRef.current = { x: e.clientX, y: e.clientY }
      evaluateGroupDragIntent(groupDragPointerRef.current)
    },
    [evaluateGroupDragIntent],
  )

  const handleGroupInsertZoneDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (!draggedGroup) return
      updateDragPointerFromEventRef.current(event)
      const pointer = { x: event.clientX, y: event.clientY }
      groupDragPointerRef.current = pointer
      evaluateGroupDragIntent(pointer)
    },
    [draggedGroup, evaluateGroupDragIntent],
  )

  const handleGroupDrop = useCallback(
    (
      e: React.DragEvent<HTMLElement>,
      targetGroupName: string,
      overrideIntent?: { mode: GroupDragMode; position?: GroupInsertPosition | null },
    ) => {
      e.preventDefault()
      e.stopPropagation()
      updateDragPointerFromEventRef.current(e)

      if (!draggedGroup || draggedGroup === targetGroupName) {
        resetGroupDragState()
        return
      }

      const dropMode = overrideIntent?.mode ?? groupDragMode
      const insertPosition =
        dropMode === "insert" ? overrideIntent?.position ?? groupInsertPosition : null

      if (dropMode !== "insert" && dropMode !== "swap") {
        resetGroupDragState()
        return
      }

      if (dropMode === "insert" && !insertPosition) {
        resetGroupDragState()
        return
      }

      const currentGrouped = groupedColorsRef.current
      const draggedColors = currentGrouped.get(draggedGroup) ?? []
      if (draggedColors.length === 0) {
        resetGroupDragState()
        return
      }

      const groupOrder = Array.from(currentGrouped.keys())
      const draggedOrderIndex = groupOrder.indexOf(draggedGroup)
      const targetOrderIndex = groupOrder.indexOf(targetGroupName)

      if (draggedOrderIndex === -1 || targetOrderIndex === -1) {
        resetGroupDragState()
        return
      }

      const newOrder = [...groupOrder]

      if (dropMode === "insert" && insertPosition) {
        newOrder.splice(draggedOrderIndex, 1)
        let insertionIndex = targetOrderIndex + (insertPosition === "after" ? 1 : 0)
        if (draggedOrderIndex < insertionIndex) {
          insertionIndex -= 1
        }
        insertionIndex = Math.max(0, Math.min(newOrder.length, insertionIndex))
        newOrder.splice(insertionIndex, 0, draggedGroup)
      } else {
        if (draggedOrderIndex === targetOrderIndex) {
          resetGroupDragState()
          return
        }
        ;[newOrder[draggedOrderIndex], newOrder[targetOrderIndex]] = [
          newOrder[targetOrderIndex],
          newOrder[draggedOrderIndex],
        ]
      }

      const hasChanged = newOrder.some((name, index) => name !== groupOrder[index])
      if (!hasChanged) {
        resetGroupDragState()
        return
      }

      const currentSwatches = swatchesRef.current
      const newSwatches: ColorSwatch[] = []
      newOrder.forEach((groupName) => {
        const items = currentGrouped.get(groupName)
        if (!items) return
        const sortedItems = [...items].sort((a, b) => a.originalIndex - b.originalIndex)
        sortedItems.forEach((item) => {
          newSwatches.push(currentSwatches[item.originalIndex])
        })
      })

      onBatchUpdateColorsRef.current(newSwatches)
      queueGroupScrollAnchorRef.current(draggedGroup)
      requestGroupSnapPostExpansionRef.current(draggedGroup, { force: true, align: "top" })
      resetGroupDragState()
    },
    [draggedGroup, groupDragMode, groupInsertPosition, resetGroupDragState],
  )

  const handleGroupInsertZoneDrop = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      groupName: string,
      position: GroupInsertPosition,
    ) => {
      event.preventDefault()
      event.stopPropagation()
      if (!draggedGroup) return
      updateDragPointerFromEventRef.current(event)
      const pointer = { x: event.clientX, y: event.clientY }
      groupDragPointerRef.current = pointer
      evaluateGroupDragIntent(pointer)
      handleGroupDrop(event as React.DragEvent<HTMLElement>, groupName, { mode: "insert", position })
    },
    [draggedGroup, evaluateGroupDragIntent, handleGroupDrop],
  )

  const handleGroupDragEnd = useCallback(() => {
    resetGroupDragState()
  }, [resetGroupDragState])

  return {
    draggedGroup,
    dragOverGroupName,
    groupDragMode,
    groupInsertPosition,
    areGroupsCollapsedForDrag,
    suppressGroupExpansionAnimation,
    handleGroupDragStart,
    handleGroupDragOver,
    handleGroupInsertZoneDragOver,
    handleGroupInsertZoneDrop,
    handleGroupDrop,
    handleGroupDragEnd,
  }
}

function schedulePostEffect(callback: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback)
  } else {
    setTimeout(callback, 0)
  }
}
