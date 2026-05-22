"use client"

import type React from "react"
import { useMemo, useState, useRef, useEffect, useLayoutEffect, useId, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Plus, FolderPlus, Trash2, ChevronDown } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  CARD_CONTROL_RADII,
  CARD_MIN_COLUMN_WIDTH,
  CARD_SIZE_TOKENS,
  CARD_GRID_GAP,
  CARD_MAX_GRID_COLUMNS,
  SEGMENTED_TOGGLE_CLASSNAMES,
} from "@/lib/design-tokens"
import type { ColorSwatch } from "@/types/palette"
import { ColorCard } from "@/components/color-manager/color-card"
import { GroupHeader } from "@/components/color-manager/group-header"
import { GroupSection, GROUP_SECTION_ANIMATION_MS } from "@/components/color-manager/group-section"
import { useCardDnd } from "@/components/color-manager/use-card-dnd"
import { useDragAutoScroll } from "@/components/color-manager/use-drag-auto-scroll"
import { useDropZoneLayout } from "@/components/color-manager/use-drop-zone-layout"
import { useGroupDnd } from "@/components/color-manager/use-group-dnd"
import { useGroupScrollAnchor } from "@/components/color-manager/use-group-scroll-anchor"
import type { ColorWithName, ColorFormatMode, DragIndicatorPosition } from "@/components/color-manager/types"
import {
  composeLabel,
  createSwatch,
  splitLabel,
  updateSwatch,
} from "@/lib/color-utils"
import { cn } from "@/lib/utils"
import { scheduleSnap, findScrollParent as detectScrollParent, type Align, type CancelHandle } from "@/lib/scroll-snap"
import { computeVerticalIndicatorPosition } from "@/lib/dnd-indicators"

type ColorManagerProps = {
  label: string
  colors: ColorSwatch[]
  onAddColor: (swatch: ColorSwatch) => void
  onRemoveColor: (index: number) => void
  onUpdateColor: (index: number, swatch: ColorSwatch) => void
  onBatchUpdateColors: (swatches: ColorSwatch[]) => void
  onColorEdit?: (index: number) => void
  activeEditingIndex?: number | null
  lastInteractedColor?: string
  collapseGroupsDuringGroupDrag: boolean
}

const GROUP_VIEWPORT_MARGIN = 16
const CARD_VIEWPORT_MARGIN = 48
const CARD_NUDGE_BAND = 28
const CARD_SNAP_MAX_ATTEMPTS = 8

type TimeoutRef = React.MutableRefObject<ReturnType<typeof setTimeout> | null>

function clearTimeoutRef(ref: TimeoutRef) {
  if (ref.current) {
    clearTimeout(ref.current)
    ref.current = null
  }
}

function scheduleTimeoutRef(ref: TimeoutRef, callback: () => void, delay: number) {
  clearTimeoutRef(ref)
  ref.current = setTimeout(() => {
    callback()
    ref.current = null
  }, delay)
}

function schedulePostEffect(callback: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback)
  } else {
    setTimeout(callback, 0)
  }
}

const UNGROUPED_LABEL = "Ungrouped"

function effectiveGroupLabel(swatch: ColorSwatch): string {
  const group = swatch.group?.trim()
  return group && group.length > 0 ? group : UNGROUPED_LABEL
}

function groupSwatchesByCategory(swatches: ColorSwatch[]): Map<string, ColorWithName[]> {
  const groups = new Map<string, ColorWithName[]>()
  // Merge groups case-insensitively while preserving the first-seen casing.
  const groupCasing = new Map<string, string>()

  swatches.forEach((swatch, originalIndex) => {
    const rawGroup = effectiveGroupLabel(swatch)
    const key = rawGroup.toLowerCase()

    let label = rawGroup
    if (groupCasing.has(key)) {
      label = groupCasing.get(key)!
    } else {
      groupCasing.set(key, rawGroup)
    }

    if (!groups.has(label)) {
      groups.set(label, [])
    }

    const displayName = composeLabel(swatch.name, swatch.group, swatch.hex) || swatch.hex
    groups.get(label)!.push({ name: displayName, hex: swatch.hex, originalIndex })
  })

  return groups
}

export function ColorManager({
  label: _label,
  colors: swatches,
  onAddColor,
  onRemoveColor,
  onUpdateColor,
  onBatchUpdateColors,
  onColorEdit,
  activeEditingIndex,
  lastInteractedColor = "#808080",
  collapseGroupsDuringGroupDrag,
}: ColorManagerProps) {
  void _label
  const getSwatchAt = (index: number): ColorSwatch | undefined => swatches[index]

  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingName, setEditingName] = useState("")
  const [originalEditingName, setOriginalEditingName] = useState("")
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState("")
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [nameError, setNameError] = useState<number | null>(null)
  const [hoveredHandleIndex, setHoveredHandleIndex] = useState<number | null>(null)
  const [isDragOverNewGroup, setIsDragOverNewGroup] = useState(false)
  const [isDragOverTrash, setIsDragOverTrash] = useState(false)
  const [isBetweenZonesActive, setIsBetweenZonesActive] = useState(false)
  const deleteZoneTooltipId = useId()

  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const newGroupZoneRef = useRef<HTMLDivElement | null>(null)
  const deleteZoneRef = useRef<HTMLDivElement | null>(null)
  const dropZonesContainerRef = useRef<HTMLDivElement | null>(null)
  const dropZonesLayoutRef = useRef<HTMLDivElement | null>(null)
  const newGroupLeaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const trashLeaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const betweenZoneLeaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const swatchesRef = useRef(swatches)
  const [indicatorPosition, setIndicatorPosition] = useState<DragIndicatorPosition | null>(null)
  const [poppingCardIds, setPoppingCardIds] = useState<string[]>([])
  const defaultSizeIndex = useMemo(() => {
    const index = CARD_SIZE_TOKENS.findIndex((token) => token.id === "md")
    return index === -1 ? 0 : index
  }, [])
  const [cardSizeIndex, setCardSizeIndex] = useState(defaultSizeIndex)
  const selectedCardSize =
    CARD_SIZE_TOKENS[Math.min(cardSizeIndex, CARD_SIZE_TOKENS.length - 1)] ??
    CARD_SIZE_TOKENS[CARD_SIZE_TOKENS.length - 1]
  const minCardWidth = CARD_MIN_COLUMN_WIDTH
  const [cardColumnCount, setCardColumnCount] = useState(1)
  const lastMeasuredGridWidthRef = useRef<number | null>(null)
  const [cardValueMode, setCardValueMode] = useState<ColorFormatMode>("hex")

  const computeColumnCount = useCallback(
    (availableWidth: number | null) => {
      if (!availableWidth || availableWidth <= 0) {
        return 1
      }
      const gap = CARD_GRID_GAP
      const targetWidth = selectedCardSize.width
      const minWidth = minCardWidth
      const maxColumns = CARD_MAX_GRID_COLUMNS
      const maxFitColumns = Math.max(1, Math.floor((availableWidth + gap) / (minWidth + gap)))
      let columns = Math.max(1, Math.floor((availableWidth + gap) / (targetWidth + gap)))
      columns = Math.min(columns, maxFitColumns, maxColumns)
      let widthPerColumn =
        columns > 0 ? (availableWidth - gap * (columns - 1)) / Math.max(columns, 1) : availableWidth

      while (columns > 1 && widthPerColumn < minWidth) {
        columns -= 1
        widthPerColumn = (availableWidth - gap * (columns - 1)) / Math.max(columns, 1)
      }

      return Math.max(1, Math.min(columns, maxColumns))
    },
    [minCardWidth, selectedCardSize.width],
  )

  const handleGridWidthChange = useCallback(
    (width: number | null) => {
      if (width && width > 0) {
        lastMeasuredGridWidthRef.current = width
      }
      const derived = computeColumnCount(width)
      setCardColumnCount((previous) => (previous === derived ? previous : derived))
    },
    [computeColumnCount],
  )

  useEffect(() => {
    if (lastMeasuredGridWidthRef.current !== null) {
      const derived = computeColumnCount(lastMeasuredGridWidthRef.current)
      setCardColumnCount((previous) => (previous === derived ? previous : derived))
    }
  }, [computeColumnCount])

  const [pendingNewGroupSwatchId, setPendingNewGroupSwatchId] = useState<string | null>(null)
  const [isCardSizeMenuOpen, setIsCardSizeMenuOpen] = useState(false)
  const dragViewportPointerRef = useRef<{ x: number; y: number } | null>(null)
  const pendingGroupSnapTimerRef = useRef<number | null>(null)
  const pendingGroupSnapRef = useRef<{ groupName: string; options?: { force?: boolean; align?: Align } } | null>(null)
  const cardSnapHandleRef = useRef<CancelHandle | null>(null)
  const cardSnapDelayTimeoutRef = useRef<number | null>(null)
const pendingCardSnapRef = useRef<{ index: number | null; options?: { disableSnapIllusion?: boolean; delayMs?: number } } | null>(null)
const groupSnapHandleRef = useRef<CancelHandle | null>(null)
const GROUP_SNAP_HOLD_MS = 160

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && pendingGroupSnapTimerRef.current !== null) {
        window.clearTimeout(pendingGroupSnapTimerRef.current)
        pendingGroupSnapTimerRef.current = null
      }
      if (typeof window !== "undefined" && cardSnapDelayTimeoutRef.current !== null) {
        window.clearTimeout(cardSnapDelayTimeoutRef.current)
        cardSnapDelayTimeoutRef.current = null
      }
    }
  }, [])

  const findGroupSectionElement = useCallback((groupName: string | null) => {
    if (!groupName || typeof document === "undefined") {
      return null
    }
    const sections = document.querySelectorAll<HTMLElement>("[data-group-section]")
    for (const section of sections) {
      if (section.getAttribute("data-group-name") === groupName) {
        return section
      }
    }
    return null
  }, [])

  const ensureScrollParent = useCallback((): HTMLElement | null => {
    if (typeof document === "undefined") {
      return null
    }

    const cached = scrollAnchorParentRef.current
    if (cached && cached.isConnected) {
      return cached
    }

    const root = managerRef.current
    const resolved = detectScrollParent(root ?? null)
    if (resolved) {
      scrollAnchorParentRef.current = resolved
      return resolved
    }

    const fallback = (document.scrollingElement as HTMLElement | null) ?? document.documentElement ?? null
    scrollAnchorParentRef.current = fallback
    return fallback
  }, [])

  const { queueGroupScrollAnchor, releaseGroupScrollAnchor } = useGroupScrollAnchor({
    enabled: collapseGroupsDuringGroupDrag,
    getScrollParent: ensureScrollParent,
    findGroupSectionElement,
  })

  const cancelCardSnap = useCallback(() => {
    if (cardSnapHandleRef.current) {
      cardSnapHandleRef.current.cancel()
      cardSnapHandleRef.current = null
    }
  }, [])

  const cancelGroupSnap = useCallback(() => {
    if (groupSnapHandleRef.current) {
      groupSnapHandleRef.current.cancel()
      groupSnapHandleRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      cancelCardSnap()
      cancelGroupSnap()
    }
  }, [cancelCardSnap, cancelGroupSnap])

  const snapGroupIntoView = useCallback(
    (
      groupName: string | null,
      options: { force?: boolean; align?: Align; skipSnapIllusion?: boolean } = {},
    ): boolean => {
      if (!groupName || typeof window === "undefined") {
        return false
      }

      cancelGroupSnap()
      groupSnapHandleRef.current = scheduleSnap({
        kind: "group",
        options: {
          root: () => managerRef.current,
          target: () => findGroupSectionElement(groupName),
          scrollParent: () => ensureScrollParent(),
          align: options.align ?? "auto",
          force: options.force ?? false,
          skipSnapIllusion: options.skipSnapIllusion ?? false,
          margins: { group: GROUP_VIEWPORT_MARGIN },
        },
      })
      return true
    },
    [cancelGroupSnap, ensureScrollParent, findGroupSectionElement],
  )

  const snapGroupIntoViewNextFrame = useCallback(
    (
      groupName: string | null,
      options?: { force?: boolean; align?: Align; skipSnapIllusion?: boolean },
    ) => {
      if (!groupName || typeof window === "undefined") return
      window.requestAnimationFrame(() => {
        snapGroupIntoView(groupName, options)
      })
    },
    [snapGroupIntoView],
  )

  const scheduleCardViewportSnap = useCallback(
    (
      index: number | null,
      options?: {
        disableSnapIllusion?: boolean
        delayMs?: number
      },
    ) => {
      if (typeof window === "undefined") {
        return
      }

      const cardResolver = () => (typeof index === "number" ? cardRefs.current.get(index) ?? null : null)
      const scrollParentResolver = () => ensureScrollParent()

      const executeSnap = () => {
        cancelCardSnap()
        cardSnapHandleRef.current = scheduleSnap(
          {
            kind: "card",
            options: {
              root: () => managerRef.current,
              card: cardResolver,
              scrollParent: scrollParentResolver,
              skipSnapIllusion: options?.disableSnapIllusion ?? false,
              margins: { card: CARD_VIEWPORT_MARGIN, group: GROUP_VIEWPORT_MARGIN, nudge: CARD_NUDGE_BAND },
            },
          },
          { maxAttempts: CARD_SNAP_MAX_ATTEMPTS },
        )
      }

      if (options?.delayMs && options.delayMs > 0) {
        if (cardSnapDelayTimeoutRef.current !== null) {
          window.clearTimeout(cardSnapDelayTimeoutRef.current)
        }
        cardSnapDelayTimeoutRef.current = window.setTimeout(() => {
          cardSnapDelayTimeoutRef.current = null
          executeSnap()
        }, options.delayMs)
        return
      }

      executeSnap()
    },
    [cancelCardSnap, ensureScrollParent],
  )

  const runPendingCardSnap = useCallback(() => {
    const pending = pendingCardSnapRef.current
    if (!pending) {
      return
    }
    pendingCardSnapRef.current = null
    scheduleCardViewportSnap(pending.index, pending.options)
  }, [scheduleCardViewportSnap])

  const flushPendingGroupSnap = useCallback(() => {
    if (typeof window !== "undefined" && pendingGroupSnapTimerRef.current !== null) {
      window.clearTimeout(pendingGroupSnapTimerRef.current)
      pendingGroupSnapTimerRef.current = null
    }
    if (!pendingGroupSnapRef.current) {
      runPendingCardSnap()
      return
    }
    const pending = pendingGroupSnapRef.current
    pendingGroupSnapRef.current = null
    snapGroupIntoViewNextFrame(pending.groupName, { ...pending.options, skipSnapIllusion: true })
    releaseGroupScrollAnchor(GROUP_SNAP_HOLD_MS)
    runPendingCardSnap()
  }, [releaseGroupScrollAnchor, runPendingCardSnap, snapGroupIntoViewNextFrame])

  const requestGroupSnapPostExpansion = useCallback(
    (groupName: string | null, options?: { force?: boolean; align?: Align }) => {
      if (!groupName) {
        return
      }
      pendingGroupSnapRef.current = { groupName, options }
      if (collapseGroupsDuringGroupDrag) {
        return
      }
      if (typeof window === "undefined") {
        flushPendingGroupSnap()
        return
      }
      if (pendingGroupSnapTimerRef.current !== null) {
        window.clearTimeout(pendingGroupSnapTimerRef.current)
      }
      pendingGroupSnapTimerRef.current = window.setTimeout(() => {
        pendingGroupSnapTimerRef.current = null
        flushPendingGroupSnap()
      }, GROUP_SNAP_HOLD_MS)
    },
    [collapseGroupsDuringGroupDrag, flushPendingGroupSnap],
  )

  const updateDragPointerFromEvent = useCallback((event: { clientX: number; clientY: number }) => {
    const { clientX, clientY } = event
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return
    }
    dragViewportPointerRef.current = { x: clientX, y: clientY }
  }, [])

  const clearGlobalDragPointer = useCallback(() => {
    dragViewportPointerRef.current = null
  }, [])

  const isCardComfortablyVisible = useCallback(
    (index: number | null) => {
      if (typeof window === "undefined" || index === null) {
        return false
      }
      const card = cardRefs.current.get(index)
      const scrollParent = ensureScrollParent()
      if (!card || !scrollParent) {
        return false
      }
      const cardRect = card.getBoundingClientRect()
      const parentRect = scrollParent.getBoundingClientRect()
      const visibleTop = parentRect.top + CARD_VIEWPORT_MARGIN
      const visibleBottom = parentRect.bottom - CARD_VIEWPORT_MARGIN
      if (cardRect.top < visibleTop || cardRect.bottom > visibleBottom) {
        return false
      }
      const nearTop = cardRect.top - visibleTop < CARD_NUDGE_BAND
      const nearBottom = visibleBottom - cardRect.bottom < CARD_NUDGE_BAND
      return !(nearTop || nearBottom)
    },
    [ensureScrollParent],
  )

  const triggerCardSnapIllusion = useCallback(
    (fromIndex: number, toIndex: number, groupName: string | null, options?: { isCrossGroup?: boolean }) => {
      const targetIndex = Number.isFinite(toIndex) ? toIndex : null
      const allowIllusion = options?.isCrossGroup ?? false

      const queueSnap = (delayMs?: number) => {
        scheduleCardViewportSnap(targetIndex, {
          disableSnapIllusion: !allowIllusion,
          delayMs,
        })
      }

      if (allowIllusion && groupName) {
        pendingCardSnapRef.current = { index: targetIndex, options: { disableSnapIllusion: false } }
        requestGroupSnapPostExpansion(groupName, { force: true, align: "top" })
        return
      }

      if (typeof window !== "undefined" && targetIndex !== null) {
        window.requestAnimationFrame(() => {
          if (isCardComfortablyVisible(targetIndex)) {
            return
          }
          queueSnap(GROUP_SNAP_HOLD_MS)
        })
        return
      }

      queueSnap(GROUP_SNAP_HOLD_MS)
    },
    [isCardComfortablyVisible, requestGroupSnapPostExpansion, scheduleCardViewportSnap],
  )

  const resetDragSiblings = useCallback(() => {
    setIsDragOverNewGroup(false)
    setIsDragOverTrash(false)
    setIsBetweenZonesActive(false)
    clearTimeoutRef(newGroupLeaveTimeoutRef)
    clearTimeoutRef(trashLeaveTimeoutRef)
    clearTimeoutRef(betweenZoneLeaveTimeoutRef)
    clearGlobalDragPointer()
  }, [clearGlobalDragPointer])

  const {
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
  } = useCardDnd({
    swatches,
    cardRefs,
    ungroupedLabel: UNGROUPED_LABEL,
    onBatchUpdateColors,
    onColorEdit,
    triggerCardSnapIllusion,
    updatePointer: updateDragPointerFromEvent,
    onResetSiblings: resetDragSiblings,
  })

  const groupedColors = groupSwatchesByCategory(swatches)
  const groupCount = groupedColors.size

  /**
   * Keyboard reorder for a colour card. Swaps the swatch at actualIndex with the
   * adjacent swatch within the same group (arrow left/right). Returns true if
   * the move happened so the caller can preventDefault.
   */
  const handleCardKeyboardMove = (actualIndex: number, direction: -1 | 1): boolean => {
    const current = swatches[actualIndex]
    if (!current) return false
    const currentGroupKey = effectiveGroupLabel(current).toLowerCase()
    let cursor = actualIndex + direction
    while (cursor >= 0 && cursor < swatches.length) {
      const candidate = swatches[cursor]
      if (candidate && effectiveGroupLabel(candidate).toLowerCase() === currentGroupKey) {
        const next = [...swatches]
        next[actualIndex] = candidate
        next[cursor] = current
        onBatchUpdateColors(next)
        return true
      }
      cursor += direction
    }
    return false
  }

  const {
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
  } = useGroupDnd({
    swatches,
    groupedColors,
    cardColumnCount,
    collapseGroupsDuringGroupDrag,
    isAnyCardDragging,
    onBatchUpdateColors,
    onColorEdit,
    findGroupSectionElement,
    queueGroupScrollAnchor,
    requestGroupSnapPostExpansion,
    updateDragPointerFromEvent,
    clearGlobalDragPointer,
  })

  useEffect(() => {
    if (areGroupsCollapsedForDrag) {
      return
    }
    const delay = suppressGroupExpansionAnimation ? GROUP_SECTION_ANIMATION_MS + 80 : 220
    releaseGroupScrollAnchor(delay)
  }, [areGroupsCollapsedForDrag, releaseGroupScrollAnchor, suppressGroupExpansionAnimation])

  useEffect(() => {
    if (suppressGroupExpansionAnimation) {
      return
    }
    flushPendingGroupSnap()
  }, [flushPendingGroupSnap, suppressGroupExpansionAnimation])

  useDragAutoScroll({
    active: draggedGroup !== null || isAnyCardDragging,
    getPointer: () => dragViewportPointerRef.current,
    getScrollParent: ensureScrollParent,
  })

  useEffect(() => {
    if (!pendingNewGroupSwatchId) return
    const index = swatches.findIndex((swatch) => swatch.id === pendingNewGroupSwatchId)
    if (index === -1) return

    schedulePostEffect(() => {
      onColorEdit?.(index)
      markDropped(index)
      scheduleCardViewportSnap(index, {
        disableSnapIllusion: false,
      })
      setPendingNewGroupSwatchId(null)
    })
  }, [markDropped, onColorEdit, pendingNewGroupSwatchId, scheduleCardViewportSnap, swatches])

  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const managerRef = useRef<HTMLDivElement | null>(null)
  const scrollAnchorParentRef = useRef<HTMLElement | null>(null)
  const previousTopRef = useRef<number | null>(null)
  const [editMode, setEditMode] = useState<"button" | "doubleClick" | null>(null)

  const [newlyCreatedGroups, setNewlyCreatedGroups] = useState<Set<string>>(new Set())
  const [removingGroups, setRemovingGroups] = useState<Set<string>>(new Set())
  const prevGroupsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const currentGroups = new Set(groupedColors.keys())
    const prevGroups = prevGroupsRef.current

    const newGroups = new Set<string>()
    currentGroups.forEach((group) => {
      if (!prevGroups.has(group)) {
        newGroups.add(group)
      }
    })

    const removedGroups = new Set<string>()
    prevGroups.forEach((group) => {
      if (!currentGroups.has(group)) {
        removedGroups.add(group)
      }
    })

    if (newGroups.size > 0) {
      schedulePostEffect(() => {
        setNewlyCreatedGroups(newGroups)
        setTimeout(() => {
          setNewlyCreatedGroups(new Set())
        }, 300)
      })
    }

    if (removedGroups.size > 0) {
      schedulePostEffect(() => {
        setRemovingGroups(removedGroups)
        setTimeout(() => {
          setRemovingGroups(new Set())
        }, 200)
      })
    }

    prevGroupsRef.current = currentGroups
  }, [groupedColors])

  useEffect(() => {
    if (dragOverIndex !== null && dragMode === "insert" && insertPosition) {
      const card = cardRefs.current.get(dragOverIndex)
      if (card) {
        const rect = card.getBoundingClientRect()
        const container = card.parentElement
        if (container) {
          const containerRect = container.getBoundingClientRect()
          const computedStyles = window.getComputedStyle(container)
          const gapValueRaw = computedStyles.columnGap || computedStyles.gap || "0"
          const gapValue = Number.parseFloat(gapValueRaw) || 0
          const indicator = computeVerticalIndicatorPosition({
            containerRect,
            targetRect: rect,
            position: insertPosition,
            gap: gapValue,
            align: "center",
            lengthStrategy: (targetHeight) => Math.max(targetHeight - 24, targetHeight * 0.7, 64),
          })
          setIndicatorPosition(indicator)
        }
      }
    } else {
      setIndicatorPosition(null)
    }
  }, [dragOverIndex, dragMode, insertPosition])

  useEffect(() => {
    swatchesRef.current = swatches
  }, [swatches])

  useEffect(() => {
    schedulePostEffect(() => {
      setPoppingCardIds((ids) => ids.filter((id) => swatches.some((swatch) => swatch.id === id)))
    })
  }, [swatches])

  useLayoutEffect(() => {
    const root = managerRef.current
    if (!root) return

    const scrollParent = ensureScrollParent()
    const prevTop = previousTopRef.current
    const currentTop = root.getBoundingClientRect().top

    if (prevTop !== null && scrollParent) {
      const delta = currentTop - prevTop
      if (Math.abs(delta) > 1) {
        scrollParent.scrollTop += delta
      }
    }

    previousTopRef.current = currentTop
  }, [cardSizeIndex, groupCount, ensureScrollParent])

  useEffect(() => {
    if (editingIndex !== null && nameInputRef.current && editMode) {
      const input = nameInputRef.current
      const value = input.value

      if (editMode === "doubleClick") {
        setTimeout(() => {
          input.setSelectionRange(value.length, value.length)
        }, 0)
      } else if (editMode === "button") {
        const slashIndex = value.indexOf("/")
        if (slashIndex !== -1) {
          setTimeout(() => {
            input.setSelectionRange(slashIndex + 1, value.length)
          }, 0)
        } else {
          setTimeout(() => {
            input.setSelectionRange(0, value.length)
          }, 0)
        }
      }
    }
  }, [editingIndex, editMode])

  const handleEditName = (index: number, mode: "button" | "doubleClick" = "button") => {
    onColorEdit?.(-1)

    const swatch = getSwatchAt(index)
    const label = swatch ? composeLabel(swatch.name, swatch.group, swatch.hex) : ""
    setEditingIndex(index)
    setEditingName(label)
    setOriginalEditingName(label)
    setEditMode(mode)
    setNameError(null)
  }

  const handleClickName = (index: number) => {
    handleEditName(index, "button")
  }

  const handleNameChange = (value: string, index: number) => {
    setEditingName(value)
    const slashCount = (value.match(/\//g) || []).length
    if (slashCount > 1) {
      setNameError(index)
    } else {
      setNameError(null)
    }
  }

  const handleSaveName = (index: number) => {
    if (nameError === index) {
      return
    }
    if (editingName !== originalEditingName) {
      const currentSwatch = getSwatchAt(index)
      const hex = currentSwatch?.hex ?? "#000000"
      const label = editingName.trim()
      const { name, group } = splitLabel(label)
      const updated = updateSwatch(currentSwatch ?? createSwatch({ hex }), {
        name,
        group,
      })
      onUpdateColor(index, updated)
    }
    setEditingIndex(null)
    setNameError(null)
    setEditMode(null)
  }

  const handleCancelNameEdit = () => {
    setEditingIndex(null)
    setNameError(null)
    setEditMode(null)
  }

  const handleEditGroupName = (oldName: string) => {
    onColorEdit?.(-1)

    setEditingGroupName(oldName)
    setNewGroupName(oldName)
  }

  const handleSaveGroupName = (oldName: string) => {
    if (newGroupName.trim() && newGroupName !== oldName) {
      const oldNameLower = oldName.toLowerCase()
      const updatedSwatches = swatches.map((swatch) => {
        const currentGroup = swatch.group?.trim() ?? ""
        if (currentGroup.toLowerCase() === oldNameLower) {
          return updateSwatch(swatch, { group: newGroupName })
        }
        return swatch
      })
      onBatchUpdateColors(updatedSwatches)
    }
    setEditingGroupName(null)
  }

  const handleCancelGroupEdit = () => {
    setEditingGroupName(null)
  }

  const handleCopyValue = (value: string, index: number) => {
    navigator.clipboard.writeText(value)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  // Card DnD handlers + state are owned by useCardDnd above; leave-timer and
  // pointer cleanup happen via resetDragSiblings when the hook resets state.


  const getNextGroupName = useCallback(() => {
    const existingGroupsLower = new Set(Array.from(groupedColors.keys(), (group) => group.toLowerCase()))
    const baseName = "newGroup"
    let candidate = baseName
    let counter = 1

    while (existingGroupsLower.has(candidate.toLowerCase())) {
      counter += 1
      candidate = `${baseName}${counter}`
    }

    return candidate
  }, [groupedColors])

  const handleAddNewGroup = () => {
    const groupName = getNextGroupName()
    const defaultHex = lastInteractedColor ?? "#808080"
    const defaultName = defaultHex.replace("#", "")
    const newSwatch = createSwatch({ hex: defaultHex, name: defaultName, group: groupName })

    setPendingNewGroupSwatchId(newSwatch.id)
    onAddColor(newSwatch)
  }

  const scheduleCardRemoval = (index: number) => {
    const swatch = getSwatchAt(index)
    if (!swatch) {
      onColorEdit?.(-1)
      onRemoveColor(index)
      return
    }

    const removalSwatchId = swatch.id
    const existingTimeout = removalTimeoutsRef.current.get(removalSwatchId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    setPoppingCardIds((current) =>
      current.includes(removalSwatchId) ? current : [...current, removalSwatchId],
    )

    const timeout = setTimeout(() => {
      const currentIndex = swatchesRef.current.findIndex((item) => item.id === removalSwatchId)
      if (currentIndex !== -1) {
        onColorEdit?.(-1)
        onRemoveColor(currentIndex)
      }
      setPoppingCardIds((current) => current.filter((id) => id !== removalSwatchId))
      removalTimeoutsRef.current.delete(removalSwatchId)
    }, CARD_REMOVE_ANIMATION_MS)

    removalTimeoutsRef.current.set(removalSwatchId, timeout)
  }

  const handleDropOnNewGroup = (e: React.DragEvent) => {
    updateDragPointerFromEvent(e)
    e.preventDefault()
    e.stopPropagation()

    if (draggedIndex !== null) {
      const draggedSwatch = swatches[draggedIndex]
      if (draggedSwatch) {
        const groupName = getNextGroupName()
        const replacedName = draggedSwatch.hex.replace("#", "")
        onUpdateColor(
          draggedIndex,
          updateSwatch(draggedSwatch, { name: replacedName, group: groupName }),
        )
        triggerCardSnapIllusion(draggedIndex, draggedIndex, groupName, { isCrossGroup: true })
      }
    }

    resetCardDrag()
  }

  const handleDropOnTrash = (e: React.DragEvent) => {
    updateDragPointerFromEvent(e)
    e.preventDefault()
    e.stopPropagation()

    if (draggedIndex !== null) {
      scheduleCardRemoval(draggedIndex)
    }

    resetCardDrag()
  }

  const groupNameTextClass = "text-3xl font-medium"

  const handleCardClick = (index: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.tagName === "INPUT" ||
      target.tagName === "BUTTON"
    ) {
      return
    }

    onColorEdit?.(index)
  }

  const removalTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  useEffect(() => {
    const removalTimeouts = removalTimeoutsRef.current
    return () => {
    clearTimeoutRef(newGroupLeaveTimeoutRef)
    clearTimeoutRef(trashLeaveTimeoutRef)
      clearTimeoutRef(betweenZoneLeaveTimeoutRef)
      removalTimeouts.forEach((timeout) => clearTimeout(timeout))
      removalTimeouts.clear()
    }
  }, [])

  const { dropZoneDimensionStyle, dropZonesStacked } = useDropZoneLayout({
    fallbackWidth: selectedCardSize.width,
    isDragging: isAnyCardDragging,
    getFirstCard: () => {
      const iterator = cardRefs.current.values().next()
      return (iterator.done ? null : iterator.value) ?? null
    },
    containerRef: dropZonesContainerRef,
    layoutRef: dropZonesLayoutRef,
    cardSizeIndex,
    swatchCount: swatches.length,
  })

  const dropZoneBaseClass =
    "group relative flex shrink-0 flex-col rounded-lg border-2 border-transparent bg-transparent duration-200 ease-in-out transition-[border-color,background-color,box-shadow,opacity]"
  const DROP_ZONE_EXIT_DELAY = 240
  const CARD_REMOVE_ANIMATION_MS = 220
  const newGroupDropZoneActive = isBetweenZonesActive || isDragOverNewGroup
  const deleteDropZoneActive = isBetweenZonesActive || isDragOverTrash
  const isDropZoneExpanded = newGroupDropZoneActive || deleteDropZoneActive
  const shouldCollapseGroups = collapseGroupsDuringGroupDrag && areGroupsCollapsedForDrag

  return (
    <div
      ref={managerRef}
      className="relative space-y-5 p-4"
      style={{ overflowAnchor: "none" }}
    >
      <div className="relative overflow-visible rounded-lg border border-border/50 bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Card Size</span>
            <DropdownMenu open={isCardSizeMenuOpen} onOpenChange={setIsCardSizeMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "flex cursor-pointer items-center gap-2 border-border px-3 py-1 text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-primary/40",
                    isCardSizeMenuOpen ? "border-primary/60 bg-primary/5 text-primary" : "",
                  )}
                  style={{
                    borderRadius: isCardSizeMenuOpen ? CARD_CONTROL_RADII.elevated : CARD_CONTROL_RADII.pill,
                  }}
                >
                  <span>{selectedCardSize.label}</span>
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={6}
                className="border border-border bg-background/95 p-2 shadow-lg backdrop-blur"
                style={{ borderRadius: CARD_CONTROL_RADII.elevated }}
              >
                <div className="flex items-center gap-1">
                  {CARD_SIZE_TOKENS.map((option, index) => {
                    const isActive = index === cardSizeIndex
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setCardSizeIndex(index)
                          setIsCardSizeMenuOpen(false)
                        }}
                        className={cn(
                          "relative flex h-8 min-w-[2.5rem] cursor-pointer items-center justify-center px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          isActive ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/85" : "bg-muted text-foreground hover:bg-muted/70",
                        )}
                        style={{
                          borderRadius: isActive ? CARD_CONTROL_RADII.elevated : CARD_CONTROL_RADII.pill,
                        }}
                      >
                        <span>{option.label}</span>
                      </button>
                    )
                  })}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Value</span>
            <div className={SEGMENTED_TOGGLE_CLASSNAMES.container}>
              {(["hex", "hsluv"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCardValueMode(mode)}
                  className={cn(
                    SEGMENTED_TOGGLE_CLASSNAMES.option,
                    cardValueMode === mode
                      ? SEGMENTED_TOGGLE_CLASSNAMES.optionActive
                      : SEGMENTED_TOGGLE_CLASSNAMES.optionInactive,
                  )}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {Array.from(groupedColors.entries()).map(([groupName, groupColors], groupIndex) => {
        const isGroupDragging = draggedGroup === groupName
        const isGroupSwapTarget = dragOverGroupName === groupName && groupDragMode === "swap"
        const isGroupInsertTarget = dragOverGroupName === groupName && groupDragMode === "insert"
        const insertPositionForGroup = isGroupInsertTarget ? groupInsertPosition : null
        const isNewlyCreated = newlyCreatedGroups.has(groupName)
        const isRemoving = removingGroups.has(groupName)
        const showIndicator = dragMode === "insert" && dragOverGroup === groupName && indicatorPosition !== null

        const header = (
          <GroupHeader
            groupName={groupName}
            groupNameTextClass={groupNameTextClass}
            isEditing={editingGroupName === groupName}
            editingValue={editingGroupName === groupName ? newGroupName : groupName}
            isUngrouped={groupName === UNGROUPED_LABEL}
            onChangeEditingValue={(value) => {
              if (editingGroupName === groupName) {
                setNewGroupName(value)
              }
            }}
            onSaveEditingValue={() => handleSaveGroupName(groupName)}
            onCancelEditing={handleCancelGroupEdit}
            onStartEditing={() => handleEditGroupName(groupName)}
            onDragStart={(event) => handleGroupDragStart(event, groupName)}
            onDragEnd={handleGroupDragEnd}
          />
        )

        const addButton = (
          <div
            className="relative w-full"
            onDragOver={(event) => {
              updateDragPointerFromEvent(event)
              event.preventDefault()
              if (draggedIndex !== null && groupColors.length > 0) {
                const lastIndex = groupColors[groupColors.length - 1].originalIndex
                handleInsertZoneHover(lastIndex, groupName, "after")
              }
            }}
            onDragLeave={(event) => {
              const relatedTarget = event.relatedTarget as HTMLElement | null
              if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
                handleInsertZoneLeave()
              }
            }}
          >
            <button
              type="button"
              aria-label="Add color card"
              className="group relative flex w-full cursor-pointer flex-col items-stretch gap-1.5 overflow-visible rounded-xl border border-transparent bg-white p-2.5 pb-3 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-500 focus-visible:ring-offset-background"
              onClick={() => {
                const isUngrouped = groupName === UNGROUPED_LABEL
                onAddColor(
                  createSwatch({
                    hex: lastInteractedColor,
                    name: isUngrouped ? "" : "new",
                    group: isUngrouped ? null : groupName.toLowerCase(),
                  }),
                )
              }}
            >
              <div className="flex w-full items-center justify-between px-0.5 text-[11px] font-semibold text-transparent" aria-hidden="true">
                <span className="font-mono text-[11px] uppercase tracking-tight opacity-0 select-none">
                  Add Color
                </span>
                <div className="flex items-center gap-1">
                  <span className="inline-flex h-6 w-6 rounded-md border border-transparent" />
                  <span className="inline-flex h-6 w-6 rounded-md border border-transparent" />
                </div>
              </div>

              <div className="w-full overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white shadow-sm transition group-hover:border-slate-400 group-hover:bg-slate-50">
                <div className="flex h-24 w-full items-center justify-center border-b border-dashed border-slate-300 bg-gradient-to-b from-white to-slate-50 transition group-hover:from-slate-50 group-hover:to-white">
                  <Plus className="h-8 w-8 text-slate-400 transition group-hover:text-slate-600" />
                </div>
                <div className="flex items-center justify-between px-2.5 pb-1.5 pt-2.5">
                  <span className="inline-flex h-7 w-7 shrink-0 rounded-md border border-transparent" aria-hidden="true" />
                  <span className="font-mono text-sm uppercase tracking-wide text-slate-500 transition group-hover:text-slate-700">
                    Add Color
                  </span>
                  <span className="inline-flex h-7 w-7 shrink-0 rounded-md border border-transparent" aria-hidden="true" />
                </div>
              </div>
            </button>
          </div>
        )

        return (
          <GroupSection
            key={groupName}
            groupName={groupName}
            isGroupDragging={isGroupDragging}
            isGroupDragOver={isGroupSwapTarget && !!draggedGroup}
            isNewlyCreated={isNewlyCreated}
            isRemoving={isRemoving}
            indicatorPosition={indicatorPosition}
            showIndicator={showIndicator}
            cardColumnCount={cardColumnCount}
            isCollapsed={shouldCollapseGroups}
            isInsertTarget={isGroupInsertTarget && !!draggedGroup}
            insertPosition={insertPositionForGroup}
            isGroupDragActive={!!draggedGroup}
            shouldMeasureGrid={groupIndex === 0}
            onGridWidthChange={handleGridWidthChange}
            suppressExpansionAnimation={suppressGroupExpansionAnimation}
            onGroupReorderDragOver={handleGroupDragOver}
            onGroupReorderDrop={(event) => handleGroupDrop(event, groupName)}
            onCardDragOver={(event) => handleDragOverGroup(event, groupName)}
            onCardDrop={handleDrop}
            onInsertZoneDragOver={(event) => handleGroupInsertZoneDragOver(event)}
            onInsertZoneDrop={(event, position) => handleGroupInsertZoneDrop(event, groupName, position)}
            header={header}
            addButton={addButton}
          >
            {groupColors.map((colorItem, idx) => {
              const actualIndex = colorItem.originalIndex
              const swatch = getSwatchAt(actualIndex)
              const isDraggingCard = draggedIndex === actualIndex
              const isDropTarget = dragOverIndex === actualIndex

              return (
                <ColorCard
                  key={swatch?.id ?? colorItem.hex + "-" + actualIndex}
                  color={colorItem}
                  nameInputRef={nameInputRef}
                  registerCardRef={(element) => {
                    if (element) {
                      cardRefs.current.set(actualIndex, element)
                    } else {
                      cardRefs.current.delete(actualIndex)
                    }
                  }}
                  showBeforeInsertZone={idx > 0}
                  showAfterInsertZone={idx < groupColors.length - 1}
                  state={{
                    isDragging: isDraggingCard,
                    isDropTarget,
                    showSwapTarget: dragMode === "swap",
                    highlightHandle: hoveredHandleIndex === actualIndex,
                    highlightActiveEditing: activeEditingIndex === actualIndex,
                    showCopySuccess: copiedIndex === actualIndex,
                    showJustDropped: justDropped && droppedAtIndex === actualIndex,
                    showDeleting: swatch ? poppingCardIds.includes(swatch.id) : false,
                    insertPosition:
                      dragMode === "insert" && dragOverIndex === actualIndex ? insertPosition : null,
                    isEditingName: editingIndex === actualIndex,
                    editingName,
                    hasNameError: nameError === actualIndex,
                  }}
                  onNameChange={(value) => handleNameChange(value, actualIndex)}
                  onNameSave={() => handleSaveName(actualIndex)}
                  onNameCancel={handleCancelNameEdit}
                  onNameEdit={(mode = "button") => handleEditName(actualIndex, mode)}
                  onNameClick={() => handleClickName(actualIndex)}
                  onDelete={() => setDeleteIndex(actualIndex)}
                  onCopyValue={(value) => handleCopyValue(value, actualIndex)}
                  onDragStart={(event) => handleDragStart(event, actualIndex)}
                  onDragEnd={() => handleDragEnd()}
                  onDragOver={(event) => handleDragOver(event, actualIndex)}
                  onDragLeave={() => handleDragLeave()}
                  onInsertZoneHover={(position) => handleInsertZoneHover(actualIndex, groupName, position)}
                  onInsertZoneLeave={() => handleInsertZoneLeave()}
                  onCardClick={(event) => handleCardClick(actualIndex, event)}
                  onHandleHover={(hovering) => setHoveredHandleIndex(hovering ? actualIndex : null)}
                  onSwatchClick={() => onColorEdit?.(actualIndex)}
                  onHandleKeyboardMove={(direction) => handleCardKeyboardMove(actualIndex, direction)}
                  valueMode={cardValueMode}
                />
              )
            })}
          </GroupSection>
        )
      })}

      <div
        ref={dropZonesContainerRef}
        className={cn(
          "relative flex w-full justify-start transition-all duration-300 ease-in-out",
          isDropZoneExpanded ? "py-6" : "pt-3 pb-5",
        )}
        onDragOver={(event) => {
          updateDragPointerFromEvent(event)
          if (!isAnyCardDragging) return
          event.preventDefault()
          setIsBetweenZonesActive(true)
          setIsDragOverNewGroup(false)
          setIsDragOverTrash(false)
        }}
        onDragLeave={(event) => {
          const related = event.relatedTarget as Node | null
          if (
            related &&
            (dropZonesContainerRef.current?.contains(related) ?? false)
          ) {
            return
          }
          scheduleTimeoutRef(betweenZoneLeaveTimeoutRef, () => {
            setIsBetweenZonesActive(false)
            setIsDragOverNewGroup(false)
            setIsDragOverTrash(false)
          }, DROP_ZONE_EXIT_DELAY)
        }}
        onDrop={(event) => {
          event.preventDefault()
          clearTimeoutRef(betweenZoneLeaveTimeoutRef)
          setIsDragOverNewGroup(false)
          setIsDragOverTrash(false)
          setIsBetweenZonesActive(false)
        }}
      >
        <div
          ref={dropZonesLayoutRef}
          className={cn(
            "flex w-full transition-all duration-300 ease-in-out",
            dropZonesStacked ? "flex-col items-center gap-6" : "flex-row items-start justify-between gap-6",
          )}
        >
          <div
            ref={newGroupZoneRef}
            className={cn(
              dropZoneBaseClass,
              newGroupDropZoneActive
                ? isDragOverNewGroup
                  ? "h-44 border-dashed border-blue-500 bg-blue-100/80 opacity-100 shadow-sm"
                  : "h-44 border-dashed border-blue-300 bg-blue-50/60 opacity-100"
                : "bg-transparent opacity-100 hover:border-blue-200 hover:bg-blue-50/40",
            )}
            onDragOver={(e) => {
              updateDragPointerFromEvent(e)
              e.preventDefault()
              e.stopPropagation()
              if (isAnyCardDragging) {
                clearTimeoutRef(newGroupLeaveTimeoutRef)
                setIsDragOverNewGroup(true)
                setIsDragOverTrash(false)
                setIsBetweenZonesActive(true)
                handleInsertZoneLeave()
              }
            }}
            onDragLeave={(event) => {
              clearTimeoutRef(newGroupLeaveTimeoutRef)
              const related = event.relatedTarget as Node | null
              const stillWithinTray = !!related && (dropZonesContainerRef.current?.contains(related) ?? false)
              scheduleTimeoutRef(newGroupLeaveTimeoutRef, () => {
                setIsDragOverNewGroup(false)
                if (stillWithinTray && (isAnyCardDragging || isBetweenZonesActive)) {
                  setIsBetweenZonesActive(true)
                } else {
                  setIsBetweenZonesActive(false)
                  setIsDragOverTrash(false)
                }
              }, DROP_ZONE_EXIT_DELAY)
            }}
            onDrop={handleDropOnNewGroup}
            style={dropZoneDimensionStyle}
          >
            {newGroupDropZoneActive ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 transition-all duration-300 ease-in-out">
                <FolderPlus className="h-8 w-8 text-blue-600 transition-all duration-300 ease-in-out" />
                <span className="text-sm font-medium text-blue-600 transition-colors duration-300 ease-in-out">
                  Drop to Create New Group
                </span>
              </div>
            ) : (
              <Button
                variant="cardAction"
                size="card"
                type="button"
                className="w-full gap-3 uppercase tracking-wide text-sm font-semibold text-foreground/90 transition-colors duration-200 group-hover:border-blue-200 group-hover:bg-blue-50/60 group-hover:text-blue-600 cursor-pointer"
                onClick={handleAddNewGroup}
              >
                <FolderPlus className="h-6 w-6 transition-all duration-300 ease-in-out border-0" />
                New Group
              </Button>
            )}
          </div>
          <div
            ref={deleteZoneRef}
            className={cn(
              dropZoneBaseClass,
              deleteDropZoneActive
                ? isDragOverTrash
                  ? "h-44 border-dashed border-rose-500 bg-rose-100/80 opacity-100 shadow-sm"
                  : "h-44 border-dashed border-rose-300 bg-rose-50/60 opacity-100"
                : "border-transparent bg-transparent opacity-100",
            )}
            onDragOver={(e) => {
              updateDragPointerFromEvent(e)
              if (!isAnyCardDragging) return
              e.preventDefault()
              e.stopPropagation()
              clearTimeoutRef(trashLeaveTimeoutRef)
              setIsDragOverTrash(true)
              setIsDragOverNewGroup(false)
              setIsBetweenZonesActive(true)
            }}
            onDragLeave={(event) => {
              clearTimeoutRef(trashLeaveTimeoutRef)
              const related = event.relatedTarget as Node | null
              const stillWithinTray = !!related && (dropZonesContainerRef.current?.contains(related) ?? false)
              scheduleTimeoutRef(trashLeaveTimeoutRef, () => {
                setIsDragOverTrash(false)
                if (stillWithinTray && (isAnyCardDragging || isBetweenZonesActive)) {
                  setIsBetweenZonesActive(true)
                } else {
                  setIsBetweenZonesActive(false)
                  setIsDragOverNewGroup(false)
                }
              }, DROP_ZONE_EXIT_DELAY)
            }}
            onDrop={(event) => {
              if (!isAnyCardDragging) return
              handleDropOnTrash(event)
            }}
            style={dropZoneDimensionStyle}
          >
            {deleteDropZoneActive ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 transition-all duration-300 ease-in-out">
                <Trash2 className="h-8 w-8 text-rose-600 transition-all duration-300 ease-in-out" />
                <span className="text-sm font-medium text-rose-600 transition-colors duration-300 ease-in-out">
                  Drop to Delete
                </span>
              </div>
            ) : (
              <div className="relative w-full group/delete">
                <Button
                  variant="cardAction"
                  size="card"
                  type="button"
                  aria-disabled="true"
                  tabIndex={-1}
                  aria-describedby={deleteZoneTooltipId}
                  onClick={(event) => event.preventDefault()}
                  className="relative w-full justify-center gap-3 uppercase tracking-wide text-sm font-semibold border-dropzone-disabled-border bg-dropzone-disabled text-dropzone-disabled-foreground hover:border-dropzone-disabled-border hover:bg-dropzone-disabled hover:text-dropzone-disabled-foreground focus-visible:border-dropzone-disabled-border focus-visible:ring-[0px] focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:shadow-none cursor-default"
                >
                  <span className="flex items-center gap-3 text-center">
                    <Trash2 className="h-6 w-6 text-dropzone-disabled-foreground/80" />
                    Delete
                  </span>
                </Button>
                <div
                  id={deleteZoneTooltipId}
                  role="tooltip"
                  className="pointer-events-none invisible absolute left-1/2 bottom-full w-full -translate-x-1/2 -translate-y-3 rounded-md border border-dropzone-disabled-border bg-background px-3 py-2 text-xs font-medium leading-4 text-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover/delete:visible group-hover/delete:opacity-100 group-focus-within/delete:visible group-focus-within/delete:opacity-100"
                  style={dropZoneDimensionStyle}
                >
                  Drag a card here to delete it
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={deleteIndex !== null} onOpenChange={(open) => !open && setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete color?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this color? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteIndex !== null) {
                  scheduleCardRemoval(deleteIndex)
                }
                setDeleteIndex(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
