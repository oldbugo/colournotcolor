"use client"

import React from "react"
import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Plus, Settings, Shuffle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"

import {
  extractHexFromColor,
  extractCustomName,
  evaluateContrast,
  CONTRAST_REQUIREMENTS,
  APCA_FONT_GUIDANCE,
} from "@/lib/contrast-utils"
import type {
  ContrastStandard,
  ApcaFontGuidance,
  ContrastRequirement,
  ApcaContrastEvaluation,
  ContrastRequirementId,
} from "@/lib/contrast-utils"
import type { ColorSwatch } from "@/types/palette"
import type { EditingColor } from "@/app/page"
import { composeLabel, swatchToLegacy } from "@/lib/color-utils"
import { CARD_CONTROL_RADII } from "@/lib/design-tokens"
import { DragHandle } from "@/components/ui/drag-handle"
import { DropToTrash } from "@/components/dnd/drop-to-trash"
import { computeDragMode, computeInsertTargetIndex } from "@/lib/index-dnd"
import { computeHorizontalIndicatorPosition, computeVerticalIndicatorPosition } from "@/lib/dnd-indicators"

const CARD_SIZE = 132 // px
const GAP_SIZE = 16 // px (gap-4)
const ANIMATION_DURATION = 0.25 // seconds - faster animation
const CARD_WITH_GAP = CARD_SIZE + GAP_SIZE // 148px
const BORDER_GAP = 8 // px - gap for borders (-inset-2 = 8px)
const FILTER_CONTROL_SIZE = 40 // px
const UNGROUPED_LABEL = "Ungrouped"
const DIGITS_ONLY_PATTERN = /^\d+$/
const FILTER_STORAGE_KEY = "contrast-grid-number-filters-v1"
const FILTER_STEP_VALUES = [1, 10, 100, 1000] as const
const FILTER_STEP_MAX_INDEX = FILTER_STEP_VALUES.length - 1
const CONTRAST_SLIDER_MAX = CONTRAST_REQUIREMENTS.length - 1

const STANDARD_LABELS: Record<ContrastStandard, string> = {
  wcag2: "WCAG 2.x (ratio)",
  apca: "APCA (Lc)",
}

const APCA_OVERLAY_SIZE = 420
const APCA_OVERLAY_MARGIN = 16
const POSITION_EPSILON = 0.5
const APCA_OVERLAY_HEADER_BUFFER = 120
const SCROLL_DELTA_EPSILON = 0.5
const MIDDLE_PAN_EVENT = "contrastgrid:middlepan"
// Temporary debug flag: keep APCA overlay open regardless of outside clicks.
const DEBUG_KEEP_APCA_OVERLAY_OPEN = false

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

// Walk up the DOM to find the first ancestor that can actually scroll on the requested axis.
const findScrollableParent = (node: HTMLElement | null, axis: "x" | "y"): HTMLElement | null => {
  let current: HTMLElement | null = node
  while (current) {
    const hasRoom =
      axis === "x"
        ? current.scrollWidth - current.clientWidth > SCROLL_DELTA_EPSILON
        : current.scrollHeight - current.clientHeight > SCROLL_DELTA_EPSILON
    if (hasRoom) {
      return current
    }
    current = current.parentElement
  }
  return null
}

// Apply a drag delta to a scrollable element; return any remaining distance when clamped at the edges.
const applyPanToAxis = (target: HTMLElement, delta: number, axis: "x" | "y") => {
  const total = axis === "x" ? target.scrollWidth : target.scrollHeight
  const viewport = axis === "x" ? target.clientWidth : target.clientHeight
  if (total <= viewport + SCROLL_DELTA_EPSILON) {
    return delta
  }
  const current = axis === "x" ? target.scrollLeft : target.scrollTop
  const desired = current - delta
  const clamped = clamp(desired, 0, Math.max(0, total - viewport))
  if (axis === "x") {
    target.scrollLeft = clamped
  } else {
    target.scrollTop = clamped
  }
  return desired - clamped
}

const extractNumericValue = (swatch: ColorSwatch): number | null => {
  const candidateName = swatch.name?.trim()
  if (candidateName && DIGITS_ONLY_PATTERN.test(candidateName)) {
    return Number(candidateName)
  }
  const isUngrouped = !swatch.group?.trim()
  const hexDigits = swatch.hex.replace("#", "")
  if (hexDigits && DIGITS_ONLY_PATTERN.test(hexDigits)) {
    if (isUngrouped && hexDigits.length === 6) {
      return null
    }
    return Number(hexDigits)
  }
  return null
}

const formatThresholdLabel = (value: number) => (Number.isInteger(value) ? `${value.toFixed(0)}:1` : `${value.toFixed(1)}:1`)
const formatLcThresholdLabel = (value: number) => `Lc ${value}`
const formatLcValue = (value: number) => {
  const rounded = Math.round(value * 10) / 10
  if (Object.is(rounded, -0)) {
    return "0"
  }
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)
}

type ColorEntry = {
  id: string
  legacy: string
  label: string
  baseIndex: number
  groupKey: string
  groupLabel: string
  numericValue: number | null
}

type GroupedColorEntry = {
  key: string
  label: string
  entries: ColorEntry[]
}

type NumberRange = {
  min: number
  max: number
}

type StoredFilterState = {
  rowRange: NumberRange | null
  columnRange: NumberRange | null
  rowIds: string[] | null
  columnIds: string[] | null
  filterStepIndex: number | null
}

const readFilterStorage = (): Record<string, StoredFilterState> => {
  if (typeof window === "undefined") {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, StoredFilterState>) : {}
  } catch {
    return {}
  }
}

const writeFilterStorage = (value: Record<string, StoredFilterState>) => {
  if (typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // ignore
  }
}

const isNumberRange = (value: unknown): value is NumberRange => {
  if (!value || typeof value !== "object") {
    return false
  }
  return typeof (value as NumberRange).min === "number" && typeof (value as NumberRange).max === "number"
}

const normalizeStoredFilterState = (value: unknown): StoredFilterState => {
  if (!value || typeof value !== "object") {
    return {
      rowRange: null,
      columnRange: null,
      rowIds: null,
      columnIds: null,
      filterStepIndex: null,
    }
  }

  const candidate = value as Partial<Record<string, unknown>>
  const rowRangeCandidate = (candidate.rowRange ?? candidate.rows) as NumberRange | null
  const columnRangeCandidate = (candidate.columnRange ?? candidate.columns) as NumberRange | null

  const rowIds = Array.isArray(candidate.rowIds)
    ? candidate.rowIds.filter((id): id is string => typeof id === "string")
    : null
  const columnIds = Array.isArray(candidate.columnIds)
    ? candidate.columnIds.filter((id): id is string => typeof id === "string")
    : null

  return {
    rowRange: isNumberRange(rowRangeCandidate) ? rowRangeCandidate : null,
    columnRange: isNumberRange(columnRangeCandidate) ? columnRangeCandidate : null,
    rowIds,
    columnIds,
    filterStepIndex: typeof candidate.filterStepIndex === "number" ? candidate.filterStepIndex : null,
  }
}

const serializeFilterIds = (ids: Set<string> | null) => {
  if (ids === null) {
    return null
  }
  return Array.from(ids)
}

type ContrastGridProps = {
  paletteId: string
  colors: ColorSwatch[]
  contrastStandard: ContrastStandard
  onContrastStandardChange?: (standard: ContrastStandard) => void
  onReorderColors: (fromIndex: number, toIndex: number) => void
  onSwapColors: (fromIndex: number, toIndex: number) => void
  onColorEdit?: (index: number) => void
  editingColor?: EditingColor
  onAddColor?: () => void
  onRemoveColor?: (index: number) => void
}

export function ContrastGrid({
  paletteId,
  colors,
  contrastStandard,
  onContrastStandardChange,
  onReorderColors,
  onSwapColors,
  onColorEdit,
  editingColor,
  onAddColor,
  onRemoveColor,
}: ContrastGridProps) {
  const [hoveredFgIndex, setHoveredFgIndex] = useState<number | null>(null)
  const [hoveredBgIndex, setHoveredBgIndex] = useState<number | null>(null)
  const [draggedFgIndex, setDraggedFgIndex] = useState<number | null>(null)
  const [draggedBgIndex, setDraggedBgIndex] = useState<number | null>(null)
  const [dragOverFgIndex, setDragOverFgIndex] = useState<number | null>(null)
  const [dragOverBgIndex, setDragOverBgIndex] = useState<number | null>(null)
  const [fgDragMode, setFgDragMode] = useState<"swap" | "insert" | null>(null)
  const [bgDragMode, setBgDragMode] = useState<"swap" | "insert" | null>(null)
  const [fgInsertPosition, setFgInsertPosition] = useState<"before" | "after" | null>(null)
  const [bgInsertPosition, setBgInsertPosition] = useState<"before" | "after" | null>(null)
  const [rowFilterIds, setRowFilterIds] = useState<Set<string> | null>(null)
  const [columnFilterIds, setColumnFilterIds] = useState<Set<string> | null>(null)
  const [rowNumberFilter, setRowNumberFilter] = useState<NumberRange | null>(null)
  const [columnNumberFilter, setColumnNumberFilter] = useState<NumberRange | null>(null)
  const [rowNumberInputs, setRowNumberInputs] = useState<{ min: string; max: string }>({ min: "", max: "" })
  const [columnNumberInputs, setColumnNumberInputs] = useState<{ min: string; max: string }>({ min: "", max: "" })
  const [isRowFilterMenuOpen, setIsRowFilterMenuOpen] = useState(false)
  const [isColumnFilterMenuOpen, setIsColumnFilterMenuOpen] = useState(false)
  const [isFilterOptionsMenuOpen, setIsFilterOptionsMenuOpen] = useState(false)
  const [isSwapButtonPressed, setIsSwapButtonPressed] = useState(false)
  const [filterStepIndex, setFilterStepIndex] = useState(1)
  const [filtersInitialized, setFiltersInitialized] = useState(false)
  const [apcaOverlay, setApcaOverlay] = useState<{
    key: string
    evaluation: ApcaContrastEvaluation
    requirementId: ContrastRequirementId
    fgColor: string
    bgColor: string
    statusLabel: string
  } | null>(null)
  const [apcaOverlayExpanded, setApcaOverlayExpanded] = useState(false)
  const [apcaOverlayClosing, setApcaOverlayClosing] = useState(false)
  const [apcaOverlayPosition, setApcaOverlayPosition] = useState<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)
  const [isMiddlePanning, setIsMiddlePanning] = useState(false)
  const standardLabel = STANDARD_LABELS[contrastStandard]

  const getRequirementLabel = useCallback(
    (requirement: ContrastRequirement) =>
      contrastStandard === "apca" ? requirement.apcaLabel ?? requirement.label : requirement.label,
    [contrastStandard],
  )

  const getRequirementShortLabel = useCallback(
    (requirement: ContrastRequirement) =>
      contrastStandard === "apca" ? requirement.apcaShortLabel ?? requirement.shortLabel : requirement.shortLabel,
    [contrastStandard],
  )

  const getRequirementDescription = useCallback(
    (requirement: ContrastRequirement) =>
      contrastStandard === "apca" ? requirement.apcaDescription ?? requirement.description : requirement.description,
    [contrastStandard],
  )
  const overlayGuidance = apcaOverlay ? APCA_FONT_GUIDANCE[apcaOverlay.requirementId] : undefined

  useEffect(() => {
    if (contrastStandard !== "apca") {
      setApcaOverlay(null)
      setApcaOverlayExpanded(false)
      setApcaOverlayClosing(false)
      if (apcaCloseTimeoutRef.current) {
        window.clearTimeout(apcaCloseTimeoutRef.current)
        apcaCloseTimeoutRef.current = null
      }
    }
  }, [contrastStandard])

  useEffect(() => {
    if (!apcaOverlay) {
      setApcaOverlayPosition(null)
    }
  }, [apcaOverlay, apcaOverlayExpanded])

  const gridRef = useRef<HTMLDivElement>(null)
  const fgHeaderRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const bgLabelRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const apcaCellRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const apcaOverlayRef = useRef<HTMLDivElement | null>(null)
  const contrastScrollRef = useRef<HTMLDivElement | null>(null)
  const apcaCloseTimeoutRef = useRef<number | null>(null)
  const isMiddlePanningRef = useRef(false)
  const panStateRef = useRef<{
    active: boolean
    lastX: number
    lastY: number
    xTarget: HTMLElement | null
    yTarget: HTMLElement | null
    pointerId: number | null
  }>({
    active: false,
    lastX: 0,
    lastY: 0,
    xTarget: null,
    yTarget: null,
    pointerId: null,
  })

  const closeApcaOverlay = useCallback(() => {
    if (DEBUG_KEEP_APCA_OVERLAY_OPEN) {
      return
    }
    if (!apcaOverlay || apcaOverlayClosing) {
      return
    }
    setApcaOverlayClosing(true)
    if (apcaCloseTimeoutRef.current) {
      window.clearTimeout(apcaCloseTimeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/immutability
    apcaCloseTimeoutRef.current = window.setTimeout(() => {
      setApcaOverlay(null)
      setApcaOverlayClosing(false)
      apcaCloseTimeoutRef.current = null
    }, 200)
  }, [apcaOverlay, apcaOverlayClosing])

  const updateApcaOverlayPosition = useCallback(() => {
    if (!apcaOverlay || typeof window === "undefined") {
      return
    }
    const cellNode = apcaCellRefs.current.get(apcaOverlay.key)
    if (!cellNode) {
      setApcaOverlay(null)
      return
    }

    const cellRect = cellNode.getBoundingClientRect()
    const boundsRect = contrastScrollRef.current?.getBoundingClientRect()

    const viewportBounds = {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    }

    const visibleLeft = Math.max(boundsRect?.left ?? 0, viewportBounds.left)
    const visibleRight = Math.min(boundsRect?.right ?? viewportBounds.right, viewportBounds.right)
    const visibleTop = Math.max(boundsRect?.top ?? 0, viewportBounds.top) + APCA_OVERLAY_HEADER_BUFFER
    const visibleBottom = Math.min(boundsRect?.bottom ?? viewportBounds.bottom, viewportBounds.bottom)

    const availableWidth = Math.max(0, visibleRight - visibleLeft - 2 * APCA_OVERLAY_MARGIN)
    const availableHeight = Math.max(0, visibleBottom - visibleTop - 2 * APCA_OVERLAY_MARGIN)

    const widthTarget = apcaOverlayExpanded ? availableWidth : Math.min(APCA_OVERLAY_SIZE, availableWidth || APCA_OVERLAY_SIZE)
    const heightTarget =
      apcaOverlayExpanded && availableHeight
        ? availableHeight
        : Math.min(APCA_OVERLAY_SIZE + 80, availableHeight || APCA_OVERLAY_SIZE + 80)

    const overlayWidth = clamp(
      widthTarget || APCA_OVERLAY_SIZE,
      260,
      Math.max(availableWidth || widthTarget || APCA_OVERLAY_SIZE, 260),
    )
    const overlayHeight = clamp(
      heightTarget || APCA_OVERLAY_SIZE,
      260,
      Math.max(availableHeight || heightTarget || APCA_OVERLAY_SIZE, 260),
    )

    const minLeft = visibleLeft + APCA_OVERLAY_MARGIN
    const maxLeft = visibleRight - overlayWidth - APCA_OVERLAY_MARGIN

    const minTop = visibleTop + APCA_OVERLAY_MARGIN
    const maxTop = visibleBottom - overlayHeight - APCA_OVERLAY_MARGIN

    let left = cellRect.left + cellRect.width / 2 - overlayWidth / 2
    left = clamp(left, minLeft, maxLeft)

    const targetTop = cellRect.top + cellRect.height / 2 - overlayHeight / 2
    const top = clamp(targetTop, minTop, maxTop)

    setApcaOverlayPosition((prev) => {
      if (prev && Math.abs(prev.top - top) < POSITION_EPSILON && Math.abs(prev.left - left) < POSITION_EPSILON) {
        return prev
      }
      return { top, left, width: overlayWidth, height: overlayHeight }
    })
  }, [apcaOverlay, apcaOverlayExpanded])

  useEffect(() => {
    if (!apcaOverlay) {
      return
    }
    if (DEBUG_KEEP_APCA_OVERLAY_OPEN) {
      return
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || panStateRef.current.active || isMiddlePanningRef.current) {
        return
      }
      const target = event.target as Node
      if (apcaOverlayRef.current && apcaOverlayRef.current.contains(target)) {
        return
      }
      closeApcaOverlay()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeApcaOverlay()
      }
    }
    document.addEventListener("pointerdown", handlePointerDown, true)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [apcaOverlay, closeApcaOverlay])

  useEffect(() => {
    const scrollNode = contrastScrollRef.current
    if (!scrollNode) {
      return
    }

    const stopPanning = () => {
      if (!panStateRef.current.active) return
      panStateRef.current.active = false
      setIsMiddlePanning(false)
      isMiddlePanningRef.current = false
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(MIDDLE_PAN_EVENT, { detail: false }))
      }
      if (panStateRef.current.pointerId !== null) {
        try {
          scrollNode.releasePointerCapture?.(panStateRef.current.pointerId)
        } catch {
          // ignore if capture was not set
        }
      }
      panStateRef.current.xTarget = null
      panStateRef.current.yTarget = null
      panStateRef.current.pointerId = null
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopPanning)
      window.removeEventListener("pointercancel", stopPanning)
      window.removeEventListener("blur", stopPanning)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!panStateRef.current.active) return
      event.preventDefault()
      const dx = event.clientX - panStateRef.current.lastX
      const dy = event.clientY - panStateRef.current.lastY

      let leftoverX = dx
      let leftoverY = dy

      if (panStateRef.current.xTarget) {
        leftoverX = applyPanToAxis(panStateRef.current.xTarget, dx, "x")
      }

      if (panStateRef.current.yTarget) {
        leftoverY = applyPanToAxis(panStateRef.current.yTarget, dy, "y")
      }

      if (Math.abs(leftoverX) > SCROLL_DELTA_EPSILON || Math.abs(leftoverY) > SCROLL_DELTA_EPSILON) {
        const scrollingElement = document.scrollingElement
        if (scrollingElement) {
          scrollingElement.scrollLeft -= leftoverX
          scrollingElement.scrollTop -= leftoverY
        } else {
          window.scrollBy(-leftoverX, -leftoverY)
        }
      }

      panStateRef.current.lastX = event.clientX
      panStateRef.current.lastY = event.clientY
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 1) {
        return
      }
      event.preventDefault()
      event.stopPropagation()

      const xTarget = findScrollableParent(scrollNode, "x") ?? scrollNode
      const yTarget = findScrollableParent(scrollNode, "y") ?? scrollNode

      panStateRef.current = {
        active: true,
        lastX: event.clientX,
        lastY: event.clientY,
        xTarget,
        yTarget,
        pointerId: event.pointerId,
      }
      setIsMiddlePanning(true)
      isMiddlePanningRef.current = true
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(MIDDLE_PAN_EVENT, { detail: true }))
      }
      try {
        scrollNode.setPointerCapture?.(event.pointerId)
      } catch {
        // ignore if capture fails
      }
      window.addEventListener("pointermove", handlePointerMove, { passive: false })
      window.addEventListener("pointerup", stopPanning)
      window.addEventListener("pointercancel", stopPanning)
      window.addEventListener("blur", stopPanning)
    }

    scrollNode.addEventListener("pointerdown", handlePointerDown)
    return () => {
      stopPanning()
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(MIDDLE_PAN_EVENT, { detail: false }))
      }
      scrollNode.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopPanning)
      window.removeEventListener("pointercancel", stopPanning)
      window.removeEventListener("blur", stopPanning)
    }
  }, [])

  useLayoutEffect(() => {
    if (apcaOverlay) {
      updateApcaOverlayPosition()
    }
  }, [apcaOverlay, updateApcaOverlayPosition, colors.length])

  const overlayAnimationFrameRef = useRef<number | null>(null)
  useEffect(() => {
    if (!apcaOverlay) {
      if (overlayAnimationFrameRef.current !== null) {
        cancelAnimationFrame(overlayAnimationFrameRef.current)
        overlayAnimationFrameRef.current = null
      }
      return
    }
    const tick = () => {
      updateApcaOverlayPosition()
      overlayAnimationFrameRef.current = requestAnimationFrame(tick)
    }
    overlayAnimationFrameRef.current = requestAnimationFrame(tick)
    return () => {
      if (overlayAnimationFrameRef.current !== null) {
        cancelAnimationFrame(overlayAnimationFrameRef.current)
        overlayAnimationFrameRef.current = null
      }
    }
  }, [apcaOverlay, updateApcaOverlayPosition])

  useEffect(() => {
    if (!apcaOverlay) {
      return
    }
    const handleReposition = () => {
      updateApcaOverlayPosition()
    }
    window.addEventListener("scroll", handleReposition, true)
    window.addEventListener("resize", handleReposition)
    return () => {
      window.removeEventListener("scroll", handleReposition, true)
      window.removeEventListener("resize", handleReposition)
    }
  }, [apcaOverlay, updateApcaOverlayPosition])



  const [fgAnimationState, setFgAnimationState] = useState<{
    draggedIndex: number
    targetIndex: number
  } | null>(null)
  const [bgAnimationState, setBgAnimationState] = useState<{
    draggedIndex: number
    targetIndex: number
  } | null>(null)
  const [fgIndicatorPosition, setFgIndicatorPosition] = useState<{ left: number; top: number; height?: number } | null>(
    null,
  )
  const [bgIndicatorPosition, setBgIndicatorPosition] = useState<{ left: number; top: number; width?: number } | null>(
    null,
  )
  const rowFilterTriggerRef = useRef<HTMLButtonElement | null>(null)
  const columnFilterTriggerRef = useRef<HTMLButtonElement | null>(null)
  const filterOptionsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const numberFilterStep = FILTER_STEP_VALUES[filterStepIndex] ?? FILTER_STEP_VALUES[0]

  const handleFilterStepSliderChange = useCallback((values: number[]) => {
    const rawValue = values[0]
    if (typeof rawValue !== "number") {
      return
    }
    const clamped = Math.min(FILTER_STEP_MAX_INDEX, Math.max(0, Math.round(rawValue)))
    setFilterStepIndex(clamped)
  }, [])

  const [fgOverlayStyle, setFgOverlayStyle] = useState<React.CSSProperties | null>(null)
  const [bgOverlayStyle, setBgOverlayStyle] = useState<React.CSSProperties | null>(null)

  const [fgSwapHighlightStyle, setFgSwapHighlightStyle] = useState<React.CSSProperties | null>(null)
  const [bgSwapHighlightStyle, setBgSwapHighlightStyle] = useState<React.CSSProperties | null>(null)

  const [requirementIndex, setRequirementIndex] = useState(CONTRAST_SLIDER_MAX)
  const activeRequirement = CONTRAST_REQUIREMENTS[requirementIndex]
  const hasAAARequirement = typeof activeRequirement.wcagThresholds.aaa === "number"
  const hasApcaPreferred = typeof activeRequirement.apcaThresholds.preferred === "number"
  const [isRequirementMenuOpen, setIsRequirementMenuOpen] = useState(false)
  const [isRequirementDetailsOpen, setIsRequirementDetailsOpen] = useState(false)
  const requirementLabel = getRequirementLabel(activeRequirement)
  const requirementDescription = getRequirementDescription(activeRequirement)

const colorEntries = useMemo<ColorEntry[]>(
    () =>
      colors.map((swatch, index) => {
        const groupLabel = swatch.group?.trim() || UNGROUPED_LABEL
        const groupKey = swatch.group?.trim().toLowerCase() || "__ungrouped__"
        const numericValue = extractNumericValue(swatch)
        return {
          id: swatch.id,
          legacy: swatchToLegacy(swatch),
          label: composeLabel(swatch.name, swatch.group, swatch.hex) || swatch.hex,
          baseIndex: index,
          groupKey,
          groupLabel,
          numericValue,
        }
      }),
    [colors],
  )

  const allColorIds = useMemo(() => colorEntries.map((entry) => entry.id), [colorEntries])
  const allColorIdSet = useMemo(() => new Set(allColorIds), [allColorIds])

  const groupedColorEntries = useMemo<GroupedColorEntry[]>(() => {
    const groups = new Map<string, GroupedColorEntry>()
    colorEntries.forEach((entry) => {
      if (!groups.has(entry.groupKey)) {
        groups.set(entry.groupKey, {
          key: entry.groupKey,
          label: entry.groupLabel,
          entries: [],
        })
      }
      groups.get(entry.groupKey)!.entries.push(entry)
    })
    return Array.from(groups.values())
  }, [colorEntries])

  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(
    () => new Set(groupedColorEntries.map((group) => group.key)),
  )
  useEffect(() => {
    setFiltersInitialized(false)
    const stored = normalizeStoredFilterState(readFilterStorage()[paletteId])
    setRowNumberFilter(stored.rowRange ?? null)
    setColumnNumberFilter(stored.columnRange ?? null)
    setRowFilterIds(stored.rowIds === null ? null : new Set<string>(stored.rowIds))
    setColumnFilterIds(stored.columnIds === null ? null : new Set<string>(stored.columnIds))
    if (
      typeof stored.filterStepIndex === "number" &&
      stored.filterStepIndex >= 0 &&
      stored.filterStepIndex <= FILTER_STEP_MAX_INDEX
    ) {
      setFilterStepIndex(stored.filterStepIndex)
    } else {
      setFilterStepIndex(1)
    }
    setFiltersInitialized(true)
  }, [paletteId])
  const effectiveRowFilterIds = useMemo(() => {
    if (!rowFilterIds) return null
    const filtered = [...rowFilterIds].filter((id) => allColorIdSet.has(id))
    if (filtered.length === allColorIds.length) {
      return null
    }
    return new Set(filtered)
  }, [allColorIds.length, allColorIdSet, rowFilterIds])

  const effectiveColumnFilterIds = useMemo(() => {
    if (!columnFilterIds) return null
    const filtered = [...columnFilterIds].filter((id) => allColorIdSet.has(id))
    if (filtered.length === allColorIds.length) {
      return null
    }
    return new Set(filtered)
  }, [allColorIds.length, allColorIdSet, columnFilterIds])

  const numericBounds = useMemo(() => {
    const values = colorEntries
      .map((entry) => entry.numericValue)
      .filter((value): value is number => typeof value === "number")
    if (values.length === 0) {
      return null
    }
    return {
      min: 0,
      max: Math.max(...values),
    }
  }, [colorEntries])

  const clampRangeToBounds = useCallback(
    (range: NumberRange | null): NumberRange | null => {
      if (!range || !numericBounds) {
        return numericBounds ? { ...numericBounds } : null
      }
      const min = clamp(range.min, numericBounds.min, numericBounds.max)
      const max = clamp(range.max, numericBounds.min, numericBounds.max)
      const normalizedMin = Math.min(min, max)
      const normalizedMax = Math.max(min, max)
      return { min: normalizedMin, max: normalizedMax }
    },
    [numericBounds],
  )

  useEffect(() => {
    if (!numericBounds) {
      setRowNumberFilter(null)
      setColumnNumberFilter(null)
      return
    }
    setRowNumberFilter((current) => clampRangeToBounds(current))
    setColumnNumberFilter((current) => clampRangeToBounds(current))
  }, [clampRangeToBounds, numericBounds])

  useEffect(() => {
    if (!rowNumberFilter) {
      setRowNumberInputs({ min: "", max: "" })
      return
    }
    setRowNumberInputs({
      min: rowNumberFilter.min.toString(),
      max: rowNumberFilter.max.toString(),
    })
  }, [rowNumberFilter])

  useEffect(() => {
    if (!columnNumberFilter) {
      setColumnNumberInputs({ min: "", max: "" })
      return
    }
    setColumnNumberInputs({
      min: columnNumberFilter.min.toString(),
      max: columnNumberFilter.max.toString(),
    })
  }, [columnNumberFilter])

  useEffect(() => {
    if (!filtersInitialized) {
      return
    }
    const existing = readFilterStorage()
    existing[paletteId] = {
      rowRange: rowNumberFilter,
      columnRange: columnNumberFilter,
      rowIds: serializeFilterIds(rowFilterIds),
      columnIds: serializeFilterIds(columnFilterIds),
      filterStepIndex,
    }
    writeFilterStorage(existing)
  }, [filtersInitialized, paletteId, rowNumberFilter, columnNumberFilter, rowFilterIds, columnFilterIds, filterStepIndex])

  const passesNumberFilter = useCallback(
    (entry: ColorEntry, filter: NumberRange | null) => {
      if (!filter || !numericBounds) {
        return true
      }
      if (entry.numericValue == null) {
        return true
      }
      return entry.numericValue >= filter.min && entry.numericValue <= filter.max
    },
    [numericBounds],
  )

  const rowEntries = useMemo(() => {
    const subset = effectiveRowFilterIds ? colorEntries.filter((entry) => effectiveRowFilterIds.has(entry.id)) : colorEntries
    return subset.filter((entry) => passesNumberFilter(entry, rowNumberFilter))
  }, [colorEntries, effectiveRowFilterIds, passesNumberFilter, rowNumberFilter])
  const columnEntries = useMemo(() => {
    const subset = effectiveColumnFilterIds
      ? colorEntries.filter((entry) => effectiveColumnFilterIds.has(entry.id))
      : colorEntries
    return subset.filter((entry) => passesNumberFilter(entry, columnNumberFilter))
  }, [colorEntries, effectiveColumnFilterIds, passesNumberFilter, columnNumberFilter])

  const foregroundColors = columnEntries.map((entry) => entry.legacy)
  const backgroundColors = rowEntries.map((entry) => entry.legacy)
  const foregroundBaseIndexes = columnEntries.map((entry) => entry.baseIndex)
  const backgroundBaseIndexes = rowEntries.map((entry) => entry.baseIndex)

  const editingRowIndex =
    editingColor && typeof editingColor.index === "number"
      ? backgroundBaseIndexes.indexOf(editingColor.index)
      : -1
  const editingColumnIndex =
    editingColor && typeof editingColor.index === "number"
      ? foregroundBaseIndexes.indexOf(editingColor.index)
      : -1

  const totalColorCount = colorEntries.length
  const hasRows = backgroundColors.length > 0
  const hasColumns = foregroundColors.length > 0
  const isMatrixEmpty = !hasRows && !hasColumns
  const hasRowIdFilter = rowFilterIds !== null
  const hasColumnIdFilter = columnFilterIds !== null
  const hasRowNumberFilterActive =
    !!numericBounds &&
    !!rowNumberFilter &&
    (rowNumberFilter.min > numericBounds.min || rowNumberFilter.max < numericBounds.max)
  const hasColumnNumberFilterActive =
    !!numericBounds &&
    !!columnNumberFilter &&
    (columnNumberFilter.min > numericBounds.min || columnNumberFilter.max < numericBounds.max)
  const hasActiveFilters = hasRowIdFilter || hasColumnIdFilter || hasRowNumberFilterActive || hasColumnNumberFilterActive
  const emptyStateMessage = useMemo(() => {
    if (totalColorCount === 0) {
      return "Add colors to build a contrast matrix."
    }
    if (!hasRows && !hasColumns) {
      return "All rows and columns are filtered out."
    }
    return ""
  }, [totalColorCount, hasRows, hasColumns])

  const adjustFilterSet = useCallback(
    (current: Set<string> | null, ids: string[]): Set<string> | null => {
      if (allColorIds.length === 0) {
        return null
      }
      if (ids.length === 0) {
        return current
      }
      const base = current
        ? new Set(allColorIds.filter((id) => current.has(id)))
        : new Set(allColorIds)
      const shouldDeselect = ids.every((id) => base.has(id))
      const next = new Set(base)
      ids.forEach((id) => {
        if (!allColorIdSet.has(id)) {
          return
        }
        if (shouldDeselect) {
          next.delete(id)
        } else {
          next.add(id)
        }
      })
      if (next.size === allColorIds.length) {
        return null
      }
      return next
    },
    [allColorIdSet, allColorIds],
  )

  const describeFilter = (filter: Set<string> | null) => {
    if (totalColorCount === 0) return "No colors"
    if (!filter) return "All colors"
    if (filter.size === 0) return "None"
    return `${filter.size} selected`
  }

  const rowFilterSummary = describeFilter(effectiveRowFilterIds)
  const columnFilterSummary = describeFilter(effectiveColumnFilterIds)

  const toggleRowFilterValue = (id: string) => {
    setRowFilterIds((current) => adjustFilterSet(current, [id]))
  }

  const toggleColumnFilterValue = (id: string) => {
    setColumnFilterIds((current) => adjustFilterSet(current, [id]))
  }

  const toggleRowGroupValue = (ids: string[]) => {
    setRowFilterIds((current) => adjustFilterSet(current, ids))
  }

  const toggleColumnGroupValue = (ids: string[]) => {
    setColumnFilterIds((current) => adjustFilterSet(current, ids))
  }

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroupKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const collapseAllGroups = () => {
    setCollapsedGroupKeys(new Set(groupedColorEntries.map((group) => group.key)))
  }

  const expandAllGroups = () => {
    setCollapsedGroupKeys(new Set())
  }

  const selectAllRows = () => setRowFilterIds(null)
  const selectAllColumns = () => setColumnFilterIds(null)
  const clearAllRows = () => setRowFilterIds(new Set())
  const clearAllColumns = () => setColumnFilterIds(new Set())

  const handleResetFilters = useCallback(() => {
    setRowFilterIds(null)
    setColumnFilterIds(null)
    if (numericBounds) {
      setRowNumberFilter({ ...numericBounds })
      setColumnNumberFilter({ ...numericBounds })
    } else {
      setRowNumberFilter(null)
      setColumnNumberFilter(null)
    }
  }, [numericBounds])

  const swapRowColumnFilters = useCallback(() => {
    const nextRowIds = columnFilterIds ? new Set(columnFilterIds) : null
    const nextColumnIds = rowFilterIds ? new Set(rowFilterIds) : null
    const nextRowNumberFilter = columnNumberFilter ? { ...columnNumberFilter } : null
    const nextColumnNumberFilter = rowNumberFilter ? { ...rowNumberFilter } : null

    setRowFilterIds(nextRowIds)
    setColumnFilterIds(nextColumnIds)
    setRowNumberFilter(nextRowNumberFilter)
    setColumnNumberFilter(nextColumnNumberFilter)
    setIsSwapButtonPressed(false)
  }, [columnFilterIds, rowFilterIds, columnNumberFilter, rowNumberFilter])

const renderFilterGroups = (
  effectiveSet: Set<string> | null,
  toggleSingle: (id: string) => void,
  toggleGroup: (ids: string[]) => void,
  collapsedSet: Set<string>,
  onToggleCollapse: (key: string) => void,
) => {
  if (groupedColorEntries.length === 0) {
    return <div className="px-2 py-1 text-xs text-muted-foreground">No colors available</div>
  }
  return (
    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {groupedColorEntries.map((group) => {
        const groupIds = group.entries.map((entry) => entry.id)
        const selectedCount = effectiveSet
          ? groupIds.filter((id) => effectiveSet.has(id)).length
          : group.entries.length
        const isFullySelected = selectedCount === group.entries.length && group.entries.length > 0
        const isPartiallySelected = selectedCount > 0 && selectedCount < group.entries.length
        const indicatorClass = isFullySelected
          ? "bg-primary border-primary"
          : isPartiallySelected
            ? "bg-primary/60 border-primary/80"
            : "border-muted-foreground/40"
        const isCollapsed = collapsedSet.has(group.key)

        return (
          <div key={group.key} className="rounded-md border border-border/40 bg-muted/5 p-2">
            <div
              role="button"
              tabIndex={0}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onToggleCollapse(group.key)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onToggleCollapse(group.key)
                }
              }}
            >
              <span className="flex items-center gap-2 truncate">
                <span className="text-base leading-none">{isCollapsed ? "+" : "\u2212"}</span>
                <span className="truncate">{group.label}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {selectedCount}/{group.entries.length}
                <button
                  type="button"
                  className={`h-3.5 w-3.5 rounded-sm border transition-colors ${indicatorClass}`}
                  aria-label={isFullySelected ? "Deselect group" : "Select group"}
                  aria-pressed={isFullySelected ? true : isPartiallySelected ? "mixed" : false}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    toggleGroup(groupIds)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      toggleGroup(groupIds)
                    }
                  }}
                />
              </span>
            </div>
            {!isCollapsed && (
              <div className="mt-1 space-y-1">
                {group.entries.map((entry) => {
                  const isSelected = effectiveSet ? effectiveSet.has(entry.id) : true
                  const labelParts = entry.label.split("/")
                  const displayLabel = labelParts[labelParts.length - 1]?.trim() || entry.label
                  const hexColor = extractHexFromColor(entry.legacy)
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-sm ${
                        isSelected ? "text-foreground" : "text-muted-foreground"
                      } hover:bg-muted/30`}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        toggleSingle(entry.id)
                      }}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          className="h-3 w-5 rounded-[3px] border border-border/60"
                          style={{ backgroundColor: hexColor }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{displayLabel}</span>
                      </span>
                      <span
                        className={`h-3 w-3 rounded-full border ${
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
const renderNumberFilterSection = (
  label: string,
  filter: NumberRange | null,
  setFilter: React.Dispatch<React.SetStateAction<NumberRange | null>>,
  inputValues: { min: string; max: string },
  setInputValues: React.Dispatch<React.SetStateAction<{ min: string; max: string }>>,
) => {
  const normalizedRange = clampRangeToBounds(filter) ?? (numericBounds ? { ...numericBounds } : null)
  if (!numericBounds || !normalizedRange) {
    return (
      <div className="rounded-md border border-dashed border-muted-foreground/40 px-3 py-2 text-xs text-muted-foreground">
        Add numeric names (e.g., &ldquo;Red/100&rdquo;) to unlock range filtering.
        </div>
      )
    }

    const sliderValues: [number, number] = [normalizedRange.min, normalizedRange.max]

    const handleInputChange = (field: "min" | "max", value: string) => {
      setInputValues((prev) => ({ ...prev, [field]: value }))
    }

    const commitInputValue = (field: "min" | "max") => {
      const rawValue = inputValues[field]
      const fallback = field === "min" ? sliderValues[0] : sliderValues[1]
      if (!rawValue.trim()) {
        setInputValues((prev) => ({
          ...prev,
          [field]: fallback.toString(),
        }))
        return
      }
      const parsed = Number(rawValue)
      if (Number.isNaN(parsed)) {
        setInputValues((prev) => ({
          ...prev,
          [field]: fallback.toString(),
        }))
        return
      }
      if (field === "min") {
        const bounded = clamp(parsed, numericBounds.min, numericBounds.max)
        const nextMin = Math.min(bounded, sliderValues[1])
        const nextRange = clampRangeToBounds({ min: nextMin, max: sliderValues[1] })
        if (nextRange) {
          setFilter(nextRange)
        }
      } else {
        const bounded = clamp(parsed, numericBounds.min, numericBounds.max)
        const nextMax = Math.max(bounded, sliderValues[0])
        const nextRange = clampRangeToBounds({ min: sliderValues[0], max: nextMax })
        if (nextRange) {
          setFilter(nextRange)
        }
      }
    }

    return (
      <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>{label}</span>
          <button
            type="button"
            className="text-foreground underline-offset-2 hover:underline"
            onClick={() => {
              const defaults = clampRangeToBounds({ ...numericBounds })
              if (defaults) {
                setFilter(defaults)
              }
            }}
          >
            Reset
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-xs font-medium text-muted-foreground">Min</label>
          <Input
            type="number"
            inputMode="numeric"
            value={inputValues.min}
            onChange={(event) => handleInputChange("min", event.currentTarget.value)}
            onBlur={() => commitInputValue("min")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commitInputValue("min")
              }
            }}
            className="h-8"
          />
          <label className="text-xs font-medium text-muted-foreground">Max</label>
          <Input
            type="number"
            inputMode="numeric"
            value={inputValues.max}
            onChange={(event) => handleInputChange("max", event.currentTarget.value)}
            onBlur={() => commitInputValue("max")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commitInputValue("max")
              }
            }}
            className="h-8"
          />
        </div>
        <div className="px-1">
          <Slider
            min={numericBounds.min}
            max={numericBounds.max}
            step={numberFilterStep}
            value={sliderValues}
            onValueChange={(values) => {
              if (values.length < 2) return
              const nextRange = clampRangeToBounds({ min: values[0], max: values[1] })
              if (nextRange) {
                setFilter(nextRange)
              }
            }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{sliderValues[0]}</span>
          <span>{sliderValues[1]}</span>
        </div>
      </div>
    )
  }

  useEffect(() => {
    if (hoveredFgIndex !== null && gridRef.current) {
      const header = fgHeaderRefs.current.get(hoveredFgIndex)
      if (header) {
        const headerRect = header.getBoundingClientRect()
        const overlayHeight = (backgroundColors.length + 1) * CARD_WITH_GAP - GAP_SIZE + 44 // +1 for the add button row

        setFgOverlayStyle({
          left: headerRect.left - 8, // -inset-2 = 8px
          top: headerRect.top - 8,
          width: headerRect.width + 16, // 8px on each side
          height: overlayHeight,
          backgroundColor: "rgba(128, 128, 128, 0.15)",
          borderRadius: "0.5rem", // rounded-lg
        })
      }
    } else {
      setFgOverlayStyle(null)
    }
  }, [hoveredFgIndex, backgroundColors.length])

  useEffect(() => {
    if (hoveredBgIndex !== null && gridRef.current) {
      const label = bgLabelRefs.current.get(hoveredBgIndex)
      if (label) {
        const labelRect = label.getBoundingClientRect()
        const gridRect = gridRef.current.getBoundingClientRect()

        const overlayWidth = 164 + foregroundColors.length * CARD_WITH_GAP + 16 // 164px label + colors + 16px border padding

        setBgOverlayStyle({
          left: gridRect.left - 8, // -inset-2 = 8px
          top: labelRect.top - 8,
          width: overlayWidth,
          height: labelRect.height + 16,
          backgroundColor: "rgba(128, 128, 128, 0.15)",
          borderRadius: "0.5rem", // rounded-lg
        })
      }
    } else {
      setBgOverlayStyle(null)
    }
  }, [hoveredBgIndex, foregroundColors.length])

  useEffect(() => {
    if (dragOverFgIndex !== null && fgDragMode === "swap" && gridRef.current) {
      const header = fgHeaderRefs.current.get(dragOverFgIndex)
      if (header) {
        const headerRect = header.getBoundingClientRect()
        const highlightHeight = (backgroundColors.length + 1) * CARD_WITH_GAP - GAP_SIZE + 44 // +1 for the add button row

        setFgSwapHighlightStyle({
          left: headerRect.left - 8,
          top: headerRect.top - 8,
          width: headerRect.width + 16,
          height: highlightHeight,
        })
      }
    } else {
      setFgSwapHighlightStyle(null)
    }
  }, [dragOverFgIndex, fgDragMode, backgroundColors.length])

  useEffect(() => {
    if (dragOverBgIndex !== null && bgDragMode === "swap" && gridRef.current) {
      const label = bgLabelRefs.current.get(dragOverBgIndex)
      if (label) {
        const labelRect = label.getBoundingClientRect()
        const gridRect = gridRef.current.getBoundingClientRect()

        const highlightWidth = 164 + foregroundColors.length * CARD_WITH_GAP

        setBgSwapHighlightStyle({
          left: gridRect.left - 8,
          top: labelRect.top - 8,
          width: highlightWidth,
          height: labelRect.height + 16,
        })
      }
    } else {
      setBgSwapHighlightStyle(null)
    }
  }, [dragOverBgIndex, bgDragMode, foregroundColors.length])

  useEffect(() => {
    if (dragOverFgIndex !== null && fgDragMode === "insert" && fgInsertPosition) {
      const header = fgHeaderRefs.current.get(dragOverFgIndex)
      if (header && gridRef.current) {
        const rect = header.getBoundingClientRect()
        const containerRect = gridRef.current.getBoundingClientRect()

        const indicator = computeVerticalIndicatorPosition({
          containerRect,
          targetRect: rect,
          position: fgInsertPosition,
          gap: GAP_SIZE,
          offset: GAP_SIZE / 2 + 1,
          span: "container",
        })

        setFgIndicatorPosition(indicator)
      }
    } else {
      setFgIndicatorPosition(null)
    }
  }, [dragOverFgIndex, fgDragMode, fgInsertPosition])

  useEffect(() => {
    if (dragOverBgIndex !== null && bgDragMode === "insert" && bgInsertPosition) {
      const label = bgLabelRefs.current.get(dragOverBgIndex)
      if (label && gridRef.current) {
        const rect = label.getBoundingClientRect()
        const containerRect = gridRef.current.getBoundingClientRect()

        const indicator = computeHorizontalIndicatorPosition({
          containerRect,
          targetRect: rect,
          position: bgInsertPosition,
          gap: GAP_SIZE,
          offset: GAP_SIZE / 2,
          span: "container",
        })

        setBgIndicatorPosition({
          left: indicator.left,
          top: indicator.top - 2,
          width: indicator.width,
        })
      }
    } else {
      setBgIndicatorPosition(null)
    }
  }, [dragOverBgIndex, bgDragMode, bgInsertPosition])

  useEffect(() => {
    if (fgAnimationState) {
      const timer = setTimeout(() => {
        setFgAnimationState(null)
      }, ANIMATION_DURATION * 1000)
      return () => clearTimeout(timer)
    }
  }, [fgAnimationState])

  useEffect(() => {
    if (bgAnimationState) {
      const timer = setTimeout(() => {
        setBgAnimationState(null)
      }, ANIMATION_DURATION * 1000)
      return () => clearTimeout(timer)
    }
  }, [bgAnimationState])

  const handleFgDragStart = (e: React.DragEvent, index: number) => {
    setDraggedFgIndex(index)
    e.dataTransfer.effectAllowed = "move"
  }

  const applyFgDragIntent = (index: number, pointerRatio: number) => {
    const intent = computeDragMode(pointerRatio)
    setFgDragMode(intent.mode)
    setFgInsertPosition(intent.insertPosition)
    setDragOverFgIndex(index)
  }

  const applyBgDragIntent = (index: number, pointerRatio: number) => {
    const intent = computeDragMode(pointerRatio)
    setBgDragMode(intent.mode)
    setBgInsertPosition(intent.insertPosition)
    setDragOverBgIndex(index)
  }

  const handleFgDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedFgIndex !== null && draggedFgIndex !== index && draggedBgIndex === null) {
      const rect = e.currentTarget.getBoundingClientRect()
      const pointerRatio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5
      applyFgDragIntent(index, pointerRatio)
    }
  }

  const handleFgDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedFgIndex === null || dragOverFgIndex === null) {
      return
    }

    const fromBaseIndex = foregroundBaseIndexes[draggedFgIndex]
    if (typeof fromBaseIndex !== "number") {
      handleFgDragEnd()
      return
    }

    if (fgDragMode === "swap") {
      const targetBaseIndex = foregroundBaseIndexes[dragOverFgIndex]
      if (typeof targetBaseIndex !== "number") {
        handleFgDragEnd()
        return
      }
      onSwapColors(fromBaseIndex, targetBaseIndex)
    } else if (fgDragMode === "insert" && fgInsertPosition) {
      const targetIndex = computeInsertTargetIndex({
        draggedIndex: draggedFgIndex,
        dragOverIndex: dragOverFgIndex,
        insertPosition: fgInsertPosition,
        length: foregroundColors.length,
      })

      if (targetIndex === null) {
        handleFgDragEnd()
        return
      }

      const insertBeforeBase =
        targetIndex >= foregroundBaseIndexes.length ? colors.length : foregroundBaseIndexes[targetIndex]
      if (typeof insertBeforeBase !== "number") {
        handleFgDragEnd()
        return
      }
      const fromBaseIndex = foregroundBaseIndexes[draggedFgIndex]
      if (typeof fromBaseIndex !== "number") {
        handleFgDragEnd()
        return
      }
      const isMovingLeft = targetIndex <= draggedFgIndex

      setFgAnimationState({
        draggedIndex: draggedFgIndex,
        targetIndex: isMovingLeft ? targetIndex : targetIndex - 1,
      })
      onReorderColors(fromBaseIndex, insertBeforeBase)
    }
    handleFgDragEnd()
  }

  const handleFgDragEnd = () => {
    setDraggedFgIndex(null)
    setDragOverFgIndex(null)
    setFgDragMode(null)
    setFgInsertPosition(null)
  }

  const handleBgDragStart = (e: React.DragEvent, index: number) => {
    setDraggedBgIndex(index)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleBgDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedBgIndex !== null && draggedBgIndex !== index && draggedFgIndex === null) {
      const rect = e.currentTarget.getBoundingClientRect()
      const pointerRatio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5
      applyBgDragIntent(index, pointerRatio)
    }
  }

  const handleBgGapDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    // Keep the current drag state when over gaps
  }

  const handleBgDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedBgIndex === null || dragOverBgIndex === null) {
      return
    }

    if (bgDragMode === "swap") {
      const fromBaseIndex = backgroundBaseIndexes[draggedBgIndex]
      const targetBaseIndex = backgroundBaseIndexes[dragOverBgIndex]
      if (typeof fromBaseIndex !== "number" || typeof targetBaseIndex !== "number") {
        handleBgDragEnd()
        return
      }
      onSwapColors(fromBaseIndex, targetBaseIndex)
    } else if (bgDragMode === "insert" && bgInsertPosition) {
      const targetIndex = computeInsertTargetIndex({
        draggedIndex: draggedBgIndex,
        dragOverIndex: dragOverBgIndex,
        insertPosition: bgInsertPosition,
        length: backgroundColors.length,
      })

      if (targetIndex === null) {
        handleBgDragEnd()
        return
      }

      const insertBeforeBase =
        targetIndex >= backgroundBaseIndexes.length ? colors.length : backgroundBaseIndexes[targetIndex]
      const fromBaseIndex = backgroundBaseIndexes[draggedBgIndex]
      if (typeof fromBaseIndex !== "number" || typeof insertBeforeBase !== "number") {
        handleBgDragEnd()
        return
      }
      const isMovingUp = targetIndex <= draggedBgIndex

      setBgAnimationState({
        draggedIndex: draggedBgIndex,
        targetIndex: isMovingUp ? targetIndex : targetIndex - 1,
      })
      onReorderColors(fromBaseIndex, insertBeforeBase)
    }
    handleBgDragEnd()
  }

  const handleBgDragEnd = () => {
    setDraggedBgIndex(null)
    setDragOverBgIndex(null)
    setBgDragMode(null)
    setBgInsertPosition(null)
  }

  const handleDropOnTrash = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    let baseIndex: number | null = null
    if (draggedFgIndex !== null) {
      baseIndex = foregroundBaseIndexes[draggedFgIndex] ?? null
    } else if (draggedBgIndex !== null) {
      baseIndex = backgroundBaseIndexes[draggedBgIndex] ?? null
    }

    if (typeof baseIndex === "number") {
      onColorEdit?.(-1)
      onRemoveColor?.(baseIndex)
    }

    if (draggedFgIndex !== null) {
      handleFgDragEnd()
    } else if (draggedBgIndex !== null) {
      handleBgDragEnd()
    }
  }

  const handleFgHeaderClick = (index: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest("[data-drag-handle]")) {
      return
    }
    const baseIndex = foregroundBaseIndexes[index]
    if (typeof baseIndex !== "number") {
      return
    }
    onColorEdit?.(baseIndex)
  }

  const handleBgHeaderClick = (index: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest("[data-drag-handle]")) {
      return
    }
    const baseIndex = backgroundBaseIndexes[index]
    if (typeof baseIndex !== "number") {
      return
    }
    onColorEdit?.(baseIndex)
  }

  const getFgAnimationStyle = (currentIndex: number) => {
    if (!fgAnimationState) return {}

    const { draggedIndex, targetIndex } = fgAnimationState

    // The dragged item at its new position should zoom out
    if (currentIndex === targetIndex) {
      return {
        animation: `zoomOut ${ANIMATION_DURATION}s ease-out`,
      }
    }

    // The dragged item at its original position should slide away
    if (currentIndex === draggedIndex) {
      if (draggedIndex < targetIndex) {
        return {
          animation: `slideLeft ${ANIMATION_DURATION}s ease-out`,
        }
      } else {
        return {
          animation: `slideRight ${ANIMATION_DURATION}s ease-out`,
        }
      }
    }

    // Items that were displaced should slide
    if (draggedIndex < targetIndex) {
      // Dragged from left to right, items between should slide left
      if (currentIndex > draggedIndex && currentIndex <= targetIndex) {
        return {
          animation: `slideLeft ${ANIMATION_DURATION}s ease-out`,
        }
      }
    } else {
      // Dragged from right to left, items between should slide right
      if (currentIndex >= targetIndex && currentIndex < draggedIndex) {
        return {
          animation: `slideRight ${ANIMATION_DURATION}s ease-out`,
        }
      }
    }

    return {}
  }

  const getBgAnimationStyle = (currentIndex: number) => {
    if (!bgAnimationState) return {}

    const { draggedIndex, targetIndex } = bgAnimationState

    // The dragged item at its new position should zoom out
    if (currentIndex === targetIndex) {
      return {
        animation: `zoomOut ${ANIMATION_DURATION}s ease-out`,
      }
    }

    // The dragged item at its original position should slide away
    if (currentIndex === draggedIndex) {
      if (draggedIndex < targetIndex) {
        return {
          animation: `slideUp ${ANIMATION_DURATION}s ease-out`,
        }
      } else {
        return {
          animation: `slideDown ${ANIMATION_DURATION}s ease-out`,
        }
      }
    }

    // Items that were displaced should slide
    if (draggedIndex < targetIndex) {
      // Dragged from top to bottom, items between should slide up
      if (currentIndex > draggedIndex && currentIndex <= targetIndex) {
        return {
          animation: `slideUp ${ANIMATION_DURATION}s ease-out`,
        }
      }
    } else {
      // Dragged from bottom to top, items between should slide down
      if (currentIndex >= targetIndex && currentIndex < draggedIndex) {
        return {
          animation: `slideDown ${ANIMATION_DURATION}s ease-out`,
        }
      }
    }

    return {}
  }

  const getCellAnimationStyle = (fgIndex: number, bgIndex: number) => {
    const fgStyle = getFgAnimationStyle(fgIndex)
    const bgStyle = getBgAnimationStyle(bgIndex)

    // If either the column or row is animating, apply that animation to the cell
    if (Object.keys(fgStyle).length > 0) return fgStyle
    if (Object.keys(bgStyle).length > 0) return bgStyle

    return {}
  }

  const handleCellFgDragOver = (e: React.DragEvent, fgIndex: number) => {
    e.preventDefault()
    if (draggedFgIndex !== null && draggedFgIndex !== fgIndex && draggedBgIndex === null) {
      const rect = e.currentTarget.getBoundingClientRect()
      const pointerRatio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5
      applyFgDragIntent(fgIndex, pointerRatio)
    }
  }

  const handleCellBgDragOver = (e: React.DragEvent, bgIndex: number) => {
    e.preventDefault()
    e.stopPropagation() // Stop propagation to prevent conflicts

    if (draggedBgIndex === null || draggedBgIndex === bgIndex || draggedFgIndex !== null || !gridRef.current) {
      return
    }

    // This ensures consistent threshold logic across headers, cells, and gaps
    const rect = e.currentTarget.getBoundingClientRect()
    const pointerRatio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5
    applyBgDragIntent(bgIndex, pointerRatio)
  }

  const handleGridDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const isAnyHeaderDragging = draggedFgIndex !== null || draggedBgIndex !== null

  return (
    <div className="bg-background overflow-visible rounded-md p-4">
      <style jsx>{`
        @keyframes zoomOut {
          from {
            transform: scale(1.15);
            opacity: 0.8;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes slideLeft {
          from {
            transform: translateX(${CARD_WITH_GAP}px);
          }
          to {
            transform: translateX(0);
          }
        }
        @keyframes slideRight {
          from {
            transform: translateX(-${CARD_WITH_GAP}px);
          }
          to {
            transform: translateX(0);
          }
        }
        @keyframes slideUp {
          from {
            transform: translateY(${CARD_WITH_GAP}px);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes slideDown {
          from {
            transform: translateY(-${CARD_WITH_GAP}px);
          }
          to {
            transform: translateY(0);
          }
        }
        :global(.contrast-scroll-area) {
          scrollbar-width: thick;
          scrollbar-color: rgba(79, 79, 79, 0.7) rgba(0, 0, 0, 0.12);
        }
        :global(.contrast-scroll-area::-webkit-scrollbar) {
          width: 16px;
          height: 16px;
        }
        :global(.contrast-scroll-area::-webkit-scrollbar-track) {
          background-color: rgba(0, 0, 0, 0.12);
          border-radius: 999px;
        }
        :global(.contrast-scroll-area::-webkit-scrollbar-thumb) {
          background-color: rgba(79, 79, 79, 0.7);
          border-radius: 999px;
          border: 4px solid rgba(0, 0, 0, 0);
          background-clip: content-box;
        }
        :global(.contrast-scroll-area:hover::-webkit-scrollbar-thumb) {
          background-color: rgba(55, 55, 55, 0.85);
        }
      `}</style>

      <div className="mb-6 flex flex-wrap gap-4">
        <div className="space-y-3 min-w-[320px] max-w-[420px]">
          <DropdownMenu open={isRequirementMenuOpen} onOpenChange={setIsRequirementMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-expanded={isRequirementMenuOpen}
                className={`inline-flex max-w-full flex-col border border-border px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  isRequirementMenuOpen ? "border-primary/60 bg-primary/5 shadow-sm" : "bg-muted/20 hover:border-primary/40"
                }`}
                style={{
                  borderRadius: isRequirementMenuOpen ? CARD_CONTROL_RADII.elevated : CARD_CONTROL_RADII.pill,
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col text-left">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Requirement focus
                    </span>
                    <span className="text-base font-bold leading-tight text-foreground">{requirementLabel}</span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      isRequirementMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={8}
              className="w-[380px] space-y-4 border border-border bg-background/95 p-4 text-foreground shadow-lg backdrop-blur"
              style={{ borderRadius: CARD_CONTROL_RADII.elevated }}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requirement focus</p>
                    <p className="text-base font-semibold text-foreground">{requirementLabel}</p>
                    <p className="text-xs text-muted-foreground">{requirementDescription}</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full border border-border bg-background/80 px-2 py-1 text-[11px] font-semibold transition-colors duration-200">
                    <button
                      type="button"
                      onClick={() => onContrastStandardChange?.("wcag2")}
                      className={`cursor-pointer rounded-full px-2 py-0.5 transition-all duration-150 active:scale-95 ${
                        contrastStandard === "wcag2" ? "bg-foreground text-background" : "text-muted-foreground"
                      }`}
                      aria-pressed={contrastStandard === "wcag2"}
                    >
                      WCAG
                    </button>
                    <button
                      type="button"
                      onClick={() => onContrastStandardChange?.("apca")}
                      className={`cursor-pointer rounded-full px-2 py-0.5 transition-all duration-150 active:scale-95 ${
                        contrastStandard === "apca" ? "bg-foreground text-background" : "text-muted-foreground"
                      }`}
                      aria-pressed={contrastStandard === "apca"}
                    >
                      APCA
                    </button>
                  </div>
                </div>
                {contrastStandard === "wcag2" ? (
                  <p className="text-xs text-muted-foreground">
                    AA must reach {formatThresholdLabel(activeRequirement.wcagThresholds.aa)}
                    {hasAAARequirement && (
                      <>
                        {" "}
                        and AAA {formatThresholdLabel(activeRequirement.wcagThresholds.aaa!)}
                      </>
                    )}
                    .
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Minimum {formatLcThresholdLabel(activeRequirement.apcaThresholds.min)}
                    {hasApcaPreferred && (
                      <>
                        {" "}
                        - Preferred {formatLcThresholdLabel(activeRequirement.apcaThresholds.preferred!)}
                      </>
                    )}
                    .
                  </p>
                )}
              </div>
              <div className="text-xs font-medium text-muted-foreground">
                {contrastStandard === "wcag2" ? (
                  <>
                    AA {" >= "} {formatThresholdLabel(activeRequirement.wcagThresholds.aa)}
                    {hasAAARequirement && (
                      <>
                        {" "}
                        - AAA {" >= "} {formatThresholdLabel(activeRequirement.wcagThresholds.aaa!)}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    Minimum {" >= "} {formatLcThresholdLabel(activeRequirement.apcaThresholds.min)}
                    {hasApcaPreferred && (
                      <>
                        {" "}
                        - Preferred {" >= "} {formatLcThresholdLabel(activeRequirement.apcaThresholds.preferred!)}
                      </>
                    )}
                  </>
                )}
              </div>
              <div className="space-y-2 transition-all duration-200">
                <button
                  type="button"
                  className="w-full rounded-md bg-muted/30 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/50"
                  onClick={() => setIsRequirementDetailsOpen((prev) => !prev)}
                  aria-expanded={isRequirementDetailsOpen}
                >
                  Standard details
                </button>
                {isRequirementDetailsOpen && (
                  <div className="space-y-2 rounded-md border border-border/60 bg-background/90 p-3 text-xs text-muted-foreground">
                    {contrastStandard === "wcag2" ? (
                      <>
                        <p>WCAG 2.x uses relative luminance ratios.</p>
                        <p>Large text AA: 3:1; Normal text AA: 4.5:1; AAA: 7:1.</p>
                      </>
                    ) : (
                      <>
                        <p>APCA uses Lc values; readability bands vary by size/weight.</p>
                        <p>Bronze quick guide: Body text ~75-90; Large/fluent ~60-75; UI/iconography ~30-45.</p>
                        <p>Silver/Gold introduce full lookups; see APCA docs for specifics.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div>
                <input
                  type="range"
                  min={0}
                  max={CONTRAST_SLIDER_MAX}
                  step={1}
                  value={requirementIndex}
                  aria-label={`Set ${standardLabel} requirement focus`}
                  aria-valuetext={`${requirementLabel} requirement (${standardLabel})`}
                  onChange={(event) => setRequirementIndex(Number(event.currentTarget.value))}
                  className="w-full accent-foreground cursor-pointer transition-[transform,filter] duration-200 focus:brightness-110 active:brightness-125 active:scale-[1.01]"
                />
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-xs font-medium text-muted-foreground">
                {CONTRAST_REQUIREMENTS.map((option, index) => {
                  const isActive = index === requirementIndex
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setRequirementIndex(index)
                        setIsRequirementMenuOpen(false)
                      }}
                      className={`rounded-full px-3 py-1 transition-all duration-150 ${
                        isActive ? "bg-foreground text-background shadow-sm" : "bg-transparent"
                      }`}
                    >
                      {getRequirementShortLabel(option)}
                    </button>
                  )
                })}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex w-full flex-wrap items-start gap-2 justify-start md:w-auto md:ml-auto md:justify-end md:items-stretch">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={colorEntries.length === 0}
            onClick={swapRowColumnFilters}
            onPointerDown={() => setIsSwapButtonPressed(true)}
            onPointerUp={() => setIsSwapButtonPressed(false)}
            onPointerLeave={() => setIsSwapButtonPressed(false)}
            onPointerCancel={() => setIsSwapButtonPressed(false)}
            onBlur={() => setIsSwapButtonPressed(false)}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                setIsSwapButtonPressed(true)
              }
            }}
            onKeyUp={() => setIsSwapButtonPressed(false)}
            className="border border-border text-foreground transition-all hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            style={{
              borderRadius: isSwapButtonPressed ? CARD_CONTROL_RADII.elevated : CARD_CONTROL_RADII.pill,
              height: FILTER_CONTROL_SIZE,
              width: FILTER_CONTROL_SIZE,
            }}
            aria-label="Swap row and column filters"
          >
            <Shuffle className="h-4 w-4" />
          </Button>

          <DropdownMenu
            open={isRowFilterMenuOpen}
            onOpenChange={(open) => {
              setIsRowFilterMenuOpen(open)
              if (!open && rowFilterTriggerRef.current) {
                rowFilterTriggerRef.current.blur()
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                ref={rowFilterTriggerRef}
                type="button"
                variant="outline"
                size="sm"
                disabled={colorEntries.length === 0}
                className={`flex items-center gap-2 border border-border px-3 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  isRowFilterMenuOpen ? "border-primary/60 bg-primary/5 text-primary shadow-sm" : "bg-muted/20 text-foreground hover:border-primary/40"
                }`}
                style={{
                  borderRadius: isRowFilterMenuOpen ? CARD_CONTROL_RADII.elevated : CARD_CONTROL_RADII.pill,
                  height: FILTER_CONTROL_SIZE,
                }}
              >
                Rows: {rowFilterSummary}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    isRowFilterMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-[420px] space-y-3 max-h-[70vh] overflow-y-auto">
              {renderNumberFilterSection("Row Number Range", rowNumberFilter, setRowNumberFilter, rowNumberInputs, setRowNumberInputs)}
              <div className="flex items-center justify-end gap-2 pr-2 text-[11px] font-medium text-muted-foreground">
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={(event) => {
                    event.preventDefault()
                    collapseAllGroups()
                  }}
                >
                  Collapse all
                </button>
                <span className="text-muted-foreground/50">|</span>
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={(event) => {
                    event.preventDefault()
                    expandAllGroups()
                  }}
                >
                  Expand all
                </button>
              </div>
              <div className="h-px bg-border/40" />
              {renderFilterGroups(
                effectiveRowFilterIds,
                toggleRowFilterValue,
                toggleRowGroupValue,
                collapsedGroupKeys,
                toggleGroupCollapse,
              )}
              <div className="flex gap-2">
                <ConfirmActionButton variant="clear" description="This will clear every row from your selection." onConfirm={clearAllRows} />
                <ConfirmActionButton variant="select" description="This will add every row back into your selection." onConfirm={selectAllRows} />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu
            open={isColumnFilterMenuOpen}
            onOpenChange={(open) => {
              setIsColumnFilterMenuOpen(open)
              if (!open && columnFilterTriggerRef.current) {
                columnFilterTriggerRef.current.blur()
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                ref={columnFilterTriggerRef}
                type="button"
                variant="outline"
                size="sm"
                disabled={colorEntries.length === 0}
                className={`flex items-center gap-2 border border-border px-3 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  isColumnFilterMenuOpen ? "border-primary/60 bg-primary/5 text-primary shadow-sm" : "bg-muted/20 text-foreground hover:border-primary/40"
                }`}
                style={{
                  borderRadius: isColumnFilterMenuOpen ? CARD_CONTROL_RADII.elevated : CARD_CONTROL_RADII.pill,
                  height: FILTER_CONTROL_SIZE,
                }}
              >
                Columns: {columnFilterSummary}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    isColumnFilterMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-[420px] space-y-3 max-h-[70vh] overflow-y-auto">
              {renderNumberFilterSection(
                "Column Number Range",
                columnNumberFilter,
                setColumnNumberFilter,
                columnNumberInputs,
                setColumnNumberInputs,
              )}
              <div className="flex items-center justify-end gap-2 pr-2 text-[11px] font-medium text-muted-foreground">
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={(event) => {
                    event.preventDefault()
                    collapseAllGroups()
                  }}
                >
                  Collapse all
                </button>
                <span className="text-muted-foreground/50">|</span>
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={(event) => {
                    event.preventDefault()
                    expandAllGroups()
                  }}
                >
                  Expand all
                </button>
              </div>
              <div className="h-px bg-border/40" />
              {renderFilterGroups(
                effectiveColumnFilterIds,
                toggleColumnFilterValue,
                toggleColumnGroupValue,
                collapsedGroupKeys,
                toggleGroupCollapse,
              )}
              <div className="flex gap-2">
                <ConfirmActionButton
                  variant="clear"
                  description="This will clear every column from your selection."
                  onConfirm={clearAllColumns}
                />
                <ConfirmActionButton
                  variant="select"
                  description="This will add every column back into your selection."
                  onConfirm={selectAllColumns}
                />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu
            open={isFilterOptionsMenuOpen}
            onOpenChange={(open) => {
              setIsFilterOptionsMenuOpen(open)
              if (!open && filterOptionsTriggerRef.current) {
                filterOptionsTriggerRef.current.blur()
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                ref={filterOptionsTriggerRef}
                type="button"
                variant="outline"
                size="icon"
                aria-label="Filter options"
                className={`border border-border text-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  isFilterOptionsMenuOpen ? "border-primary/60 bg-primary/5 text-primary shadow-sm" : "bg-muted/20 hover:border-primary/40"
                }`}
                style={{
                  borderRadius: isFilterOptionsMenuOpen ? CARD_CONTROL_RADII.elevated : CARD_CONTROL_RADII.pill,
                  height: FILTER_CONTROL_SIZE,
                  width: FILTER_CONTROL_SIZE,
                }}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="w-[320px] space-y-4 border border-border bg-background/95 p-4 text-foreground shadow-lg backdrop-blur"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Slider scale</p>
                <p className="text-sm font-semibold text-foreground">{numberFilterStep} units per step</p>
              </div>
              <div className="space-y-3">
                <Slider
                  min={0}
                  max={FILTER_STEP_MAX_INDEX}
                  step={1}
                  value={[filterStepIndex]}
                  onValueChange={handleFilterStepSliderChange}
                />
                <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                  {FILTER_STEP_VALUES.map((value) => (
                    <span key={value}>{value}</span>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Adjust how much the row and column number sliders move whenever you drag or tap them.
              </p>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

    {fgOverlayStyle && <div className="pointer-events-none fixed z-10 rounded-lg" style={fgOverlayStyle} />}

      {bgOverlayStyle && <div className="pointer-events-none fixed z-10 rounded-lg" style={bgOverlayStyle} />}

      {fgSwapHighlightStyle && (
        <div
          className="pointer-events-none fixed z-40 rounded-lg bg-blue-500/10 border-2 border-blue-500 border-dashed"
          style={fgSwapHighlightStyle}
        />
      )}

      {bgSwapHighlightStyle && (
        <div
          className="pointer-events-none fixed z-40 rounded-lg bg-blue-500/10 border-2 border-blue-500 border-dashed"
          style={bgSwapHighlightStyle}
        />
      )}

      <div
        ref={contrastScrollRef}
        className="contrast-scroll-area overflow-auto px-4 py-4"
        style={{ cursor: isMiddlePanning ? "grabbing" : undefined }}
      >
        {isMatrixEmpty ? (
          <div className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/10 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">{emptyStateMessage}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={handleResetFilters}>
                  Reset filters
                </Button>
              )}
              {onAddColor && (
                <Button size="sm" onClick={() => onAddColor?.()}>
                  Add color
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="relative inline-block overflow-visible">
            <div
              ref={gridRef}
              className="inline-grid relative gap-4 overflow-visible"
              style={{ gridTemplateColumns: `164px repeat(${foregroundColors.length}, ${CARD_SIZE}px) ${CARD_SIZE}px` }}
              onDragOver={handleGridDragOver}
              onDrop={(e) => {
                handleFgDrop(e)
                handleBgDrop(e)
              }}
            >
            {fgIndicatorPosition && fgDragMode === "insert" && (
              <div
                className="absolute w-1 bg-blue-500 rounded-full pointer-events-none z-30"
                style={{
                  left: `${fgIndicatorPosition.left}px`,
                  top: `${fgIndicatorPosition.top}px`,
                  height: fgIndicatorPosition.height ? `${fgIndicatorPosition.height}px` : "100%",
                }}
              />
            )}

            {bgIndicatorPosition && bgDragMode === "insert" && (
              <div
                className="absolute h-1 bg-blue-500 rounded-full pointer-events-none z-30"
                style={{
                  left: `${bgIndicatorPosition.left}px`,
                  top: `${bgIndicatorPosition.top}px`,
                  width: bgIndicatorPosition.width ? `${bgIndicatorPosition.width}px` : "100%",
                }}
              />
            )}

            <div onDragOver={handleBgGapDragOver} onDrop={handleBgDrop} />

            {foregroundColors.map((color, i) => {
              const isDragging = draggedFgIndex === i
              const isEditing = editingColumnIndex === i
              const customName = extractCustomName(color)
              const hexColor = extractHexFromColor(color)
              const displayText = customName || hexColor

              return (
                <div
                  key={i}
                  ref={(el) => {
                    if (el) {
                      fgHeaderRefs.current.set(i, el)
                    } else {
                      fgHeaderRefs.current.delete(i)
                    }
                  }}
                  className="relative flex items-center flex-col transition-all duration-200 overflow-visible"
                  style={{
                    opacity: isDragging ? 0.5 : 1,
                    transform: isDragging ? "scale(0.95)" : "scale(1)",
                    ...getFgAnimationStyle(i),
                  }}
                  onDragOver={(e) => handleFgDragOver(e, i)}
                  onDrop={handleFgDrop}
                  data-color-card
                >
                  {isEditing && (
                    <div
                      className="absolute border-2 border-dashed border-gray-400 rounded-lg pointer-events-none z-20"
                      style={{ inset: `-${BORDER_GAP}px` }}
                    />
                  )}

                  <DragHandle
                    draggable
                    data-drag-handle
                    className="mb-1"
                    highlighted={hoveredFgIndex === i}
                    onDragStart={(event) => handleFgDragStart(event, i)}
                    onDragEnd={handleFgDragEnd}
                    onMouseEnter={() => setHoveredFgIndex(i)}
                    onMouseLeave={() => setHoveredFgIndex(null)}
                  />

                  <div
                    className="flex flex-col items-center justify-end border border-border transition-all cursor-pointer hover:opacity-90 rounded-md pb-0"
                    style={{
                      height: `${CARD_SIZE}px`,
                      width: `${CARD_SIZE}px`,
                      backgroundColor: hexColor,
                    }}
                    onClick={(e) => handleFgHeaderClick(i, e)}
                  >
                    <div className="w-full py-2 px-2">
                      <div className="rounded bg-white font-mono text-black text-center px-2 my-0 text-sm rounded-sm border py-1 font-light leading-6 break-words whitespace-normal min-h-[2.5rem] flex items-center justify-center">
                        <span className="block w-full break-words whitespace-normal">{displayText}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="relative flex items-center flex-col">
              <div className="mb-1 flex cursor-grab active:cursor-grabbing flex-col gap-1 rounded p-2 opacity-0 pointer-events-none">
                <div className="h-0.5 w-8 rounded-full bg-foreground/40" />
                <div className="h-0.5 w-8 rounded-full bg-foreground/40" />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="bg-transparent cursor-pointer border border-border hover:bg-foreground/5 rounded-md"
                style={{
                  height: `${CARD_SIZE}px`,
                  width: `${CARD_SIZE}px`,
                }}
                onClick={() => onAddColor?.()}
              >
                <Plus className="h-8 w-8" />
              </Button>
            </div>

            {backgroundColors.map((bgColor, bgIndex) => {
              const isBgDragging = draggedBgIndex === bgIndex
              const isEditing = editingRowIndex === bgIndex
              const bgCustomName = extractCustomName(bgColor)
              const bgHexColor = extractHexFromColor(bgColor)
              const bgDisplayText = bgCustomName || bgHexColor

              return (
                <React.Fragment key={bgIndex}>
                  {/* Background label */}
                  <div
                    ref={(el) => {
                      if (el) {
                        bgLabelRefs.current.set(bgIndex, el)
                      } else {
                        bgLabelRefs.current.delete(bgIndex)
                      }
                    }}
                    className="relative flex w-full items-center transition-all duration-200 pr-0 mr-0 gap-2 overflow-visible"
                    style={{
                      opacity: isBgDragging ? 0.5 : 1,
                      transform: isBgDragging ? "scale(0.95)" : "scale(1)",
                      ...getBgAnimationStyle(bgIndex),
                    }}
                    onDragOver={(e) => handleBgDragOver(e, bgIndex)}
                    onDrop={handleBgDrop}
                    data-color-card
                  >
                    {isEditing && (
                      <div
                        className="absolute border-2 border-dashed border-gray-400 rounded-lg pointer-events-none z-20"
                        style={{ inset: `-${BORDER_GAP}px` }}
                      />
                    )}

                      <DragHandle
                        draggable
                        data-drag-handle
                        orientation="vertical"
                        className="px-1 py-2 shrink-0"
                        highlighted={hoveredBgIndex === bgIndex}
                        onDragStart={(event) => handleBgDragStart(event, bgIndex)}
                        onDragEnd={handleBgDragEnd}
                        onMouseEnter={() => setHoveredBgIndex(bgIndex)}
                        onMouseLeave={() => setHoveredBgIndex(null)}
                      />

                    <div className="ml-auto flex flex-col items-center gap-1">
                      <div
                        className="flex flex-col items-center justify-end border border-border transition-all cursor-pointer hover:opacity-90 rounded-md pb-0"
                        style={{
                          height: `${CARD_SIZE}px`,
                          width: `${CARD_SIZE}px`,
                          backgroundColor: bgHexColor,
                        }}
                        onClick={(e) => handleBgHeaderClick(bgIndex, e)}
                      >
                        <div className="w-full px-2 py-2">
                          <div className="rounded bg-white font-mono text-black px-2 text-center border rounded-sm py-1 text-sm font-light leading-6 break-words whitespace-normal min-h-[2.5rem] flex items-center justify-center">
                            <span className="block w-full break-words whitespace-normal">{bgDisplayText}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contrast cells for this background row */}
                  {foregroundColors.map((fgColor, fgIndex) => {
                    const isFgDragging = draggedFgIndex === fgIndex
                    const fgHexColor = extractHexFromColor(fgColor)
                    const evaluation = evaluateContrast(contrastStandard, fgHexColor, bgHexColor, activeRequirement)
                    const cellKey = `${bgIndex}-${fgIndex}`
                    const isApcaEvaluation = evaluation?.standard === "apca"
                    const showApcaDetailToggle = contrastStandard === "apca" && isApcaEvaluation

                    let valueDisplay = "-"
                    let badgeContent: React.ReactNode = (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">N/A</span>
                    )
                    let cellLabel = `Contrast unavailable for ${requirementLabel}, ${standardLabel}`

                    if (evaluation?.standard === "wcag2") {
                      const ratioText = evaluation.ratio.toFixed(2)
                      valueDisplay = ratioText
                      badgeContent = (
                        <>
                          {evaluation.level.aa && (
                            <span className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white">AA</span>
                          )}
                          {hasAAARequirement && evaluation.level.aaa && (
                            <span className="rounded bg-green-700 px-2 py-0.5 text-xs font-medium text-white">AAA</span>
                          )}
                          {!evaluation.level.aa && (
                            <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white">FAIL</span>
                          )}
                        </>
                      )

                      cellLabel = `Contrast ratio ${ratioText}:1, ${
                        evaluation.level.aa ? "AA pass" : "AA fail"
                      }${hasAAARequirement ? `, ${evaluation.level.aaa ? "AAA pass" : "AAA fail"}` : ""}, ${requirementLabel}, ${standardLabel}.`
                    } else if (evaluation?.standard === "apca") {
                      const formattedLc = formatLcValue(evaluation.lcAbs)
                      valueDisplay = `Lc ${formattedLc}`
                      const status = evaluation.meetsPreferred
                        ? { label: "Preferred", className: "bg-green-600 text-white" }
                        : evaluation.meetsMinimum
                          ? { label: "Minimum", className: "bg-amber-500 text-black" }
                          : { label: "Below min", className: "bg-red-600 text-white" }

                      badgeContent = (
                        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>
                      )

                      cellLabel = `APCA contrast Lc ${formattedLc}, ${
                        evaluation.meetsPreferred
                          ? "meets preferred readability"
                          : evaluation.meetsMinimum
                            ? "meets minimum readability"
                            : "below minimum readability"
                      }, ${requirementLabel}, ${standardLabel}.`
                    }

                    const handleApcaOverlayToggle = () => {
                      if (!showApcaDetailToggle || !evaluation || evaluation.standard !== "apca") {
                        return
                      }
                      const statusLabel = evaluation.meetsPreferred
                        ? "Preferred"
                        : evaluation.meetsMinimum
                          ? "Minimum"
                          : "Below minimum"
                      setApcaOverlay((current) => {
                        if (current?.key === cellKey) {
                          return null
                        }
                        if (apcaCloseTimeoutRef.current) {
                          window.clearTimeout(apcaCloseTimeoutRef.current)
                          apcaCloseTimeoutRef.current = null
                        }
                          setApcaOverlayClosing(false)
                          setApcaOverlayExpanded(false)
                          return {
                            key: cellKey,
                            evaluation,
                            requirementId: activeRequirement.id,
                            fgColor: fgHexColor,
                            bgColor: bgHexColor,
                            statusLabel,
                          }
                        })
                    }

                    const interactiveProps = showApcaDetailToggle
                      ? {
                          role: "button" as const,
                          tabIndex: 0,
                          onClick: handleApcaOverlayToggle,
                          onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault()
                              handleApcaOverlayToggle()
                            }
                          },
                          "aria-expanded": apcaOverlay?.key === cellKey,
                        }
                      : {}

                    return (
                      <div
                        key={`${bgIndex}-${fgIndex}`}
                        ref={(node) => {
                          if (node) {
                            apcaCellRefs.current.set(cellKey, node)
                          } else {
                            apcaCellRefs.current.delete(cellKey)
                          }
                        }}
                        className="relative flex flex-col items-center justify-center border border-border transition-all duration-200 rounded-md"
                        style={{
                          height: `${CARD_SIZE}px`,
                          width: `${CARD_SIZE}px`,
                          backgroundColor: bgHexColor,
                          opacity: isFgDragging || isBgDragging ? 0.5 : 1,
                          cursor: showApcaDetailToggle ? "pointer" : undefined,
                          ...getCellAnimationStyle(fgIndex, bgIndex),
                        }}
                        aria-label={cellLabel}
                        title={cellLabel}
                        {...interactiveProps}
                        onDragOver={(e) => {
                          if (draggedFgIndex !== null) {
                            handleCellFgDragOver(e, fgIndex)
                          } else if (draggedBgIndex !== null) {
                            handleCellBgDragOver(e, bgIndex)
                          }
                        }}
                        onDrop={(e) => {
                          if (draggedFgIndex !== null) {
                            handleFgDrop(e)
                          } else if (draggedBgIndex !== null) {
                            handleBgDrop(e)
                          }
                        }}
                      >
                        <div className="relative z-10 text-2xl font-bold" style={{ color: fgHexColor }}>
                          {valueDisplay}
                        </div>
                        <div className="relative z-10 mt-2 flex gap-1">{badgeContent}</div>
                      </div>
                    )
                  })}

                  <div
                    style={{
                      height: `${CARD_SIZE}px`,
                      width: `${CARD_SIZE}px`,
                    }}
                  />
                </React.Fragment>
              )
            })}

            <div className="relative flex items-center pr-0 mr-0 gap-2">
              <div className="flex gap-1 p-2 opacity-0 pointer-events-none">
                <div className="h-8 w-0.5 rounded-full bg-foreground/40" />
                <div className="h-8 w-0.5 rounded-full bg-foreground/40" />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="rounded-lg bg-transparent cursor-pointer border border-border hover:bg-foreground/5"
                style={{
                  height: `${CARD_SIZE}px`,
                  width: `${CARD_SIZE}px`,
                }}
                onClick={() => onAddColor?.()}
              >
                <Plus className="h-8 w-8" />
              </Button>
            </div>

            {foregroundColors.map((_, fgIndex) => (
              <div
                key={`placeholder-${fgIndex}`}
                style={{
                  height: `${CARD_SIZE}px`,
                  width: `${CARD_SIZE}px`,
                }}
              />
            ))}

            <div
              style={{
                height: `${CARD_SIZE}px`,
                width: `${CARD_SIZE}px`,
              }}
            />
            </div>
          </div>
        )}
      </div>
      {apcaOverlay && apcaOverlayPosition && (
        <ApcaOverlayPanel
          ref={apcaOverlayRef}
          position={apcaOverlayPosition}
          evaluation={apcaOverlay.evaluation}
          guidance={overlayGuidance}
          fgColor={apcaOverlay.fgColor}
          bgColor={apcaOverlay.bgColor}
          statusLabel={apcaOverlay.statusLabel}
          closing={apcaOverlayClosing}
          expanded={apcaOverlayExpanded}
          onToggleExpand={() => setApcaOverlayExpanded((val) => !val)}
          onClose={closeApcaOverlay}
        />
      )}

      <DropToTrash active={isAnyHeaderDragging} onDrop={handleDropOnTrash} variant="floating" />
    </div>
  )
}

type ConfirmActionButtonProps = {
  variant: "clear" | "select"
  description: string
  onConfirm: () => void
}

const ConfirmActionButton = ({ variant, description, onConfirm }: ConfirmActionButtonProps) => {
  const isClear = variant === "clear"
  const buttonText = isClear ? "Clear all" : "Select all"
  const triggerVariant = isClear ? "blackOutline" : "black"

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={triggerVariant} size="sm" className="flex-1">
          {buttonText}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Confirm ${buttonText.toLowerCase()}`}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel asChild>
            <Button variant="blackOutline" size="sm">
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="black"
              size="sm"
              onClick={() => {
                onConfirm()
              }}
            >
              {buttonText}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type ApcaOverlayPanelProps = {
  position: { top: number; left: number; width: number; height: number }
  evaluation: ApcaContrastEvaluation
  guidance?: ApcaFontGuidance[]
  fgColor: string
  bgColor: string
  statusLabel: string
  closing: boolean
  expanded: boolean
  onToggleExpand: () => void
  onClose: () => void
}

const ApcaOverlayPanel = React.forwardRef<HTMLDivElement, ApcaOverlayPanelProps>(function ApcaOverlayPanel(
  { position, evaluation, guidance, fgColor, bgColor, statusLabel, closing, expanded, onToggleExpand, onClose },
  ref,
) {
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnimateIn(true)
  }, [])

  if (typeof document === "undefined") {
    return null
  }

  const lcValue = formatLcValue(evaluation.lcAbs)

  const guidanceEntries =
    guidance?.map((block) => {
      const rows = block.rows || []
      const match = rows.find((row) => evaluation.lcAbs >= row.minLc)
      const fallbackMin = rows[0]?.minLc ?? null
      const status =
        match && typeof match.preferredLc === "number" && evaluation.lcAbs >= match.preferredLc ? "Preferred" : "Minimum"
      return {
        weightLabel: block.weightLabel,
        description: block.description,
        chosenRow: match
          ? {
              sizeLabel: match.sizeLabel,
              status,
              minLc: match.minLc,
              preferredLc: match.preferredLc,
            }
          : null,
        rows,
        fallbackMin,
      }
    }) ?? []

  return createPortal(
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div
        ref={ref}
        className={`pointer-events-auto rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur-xl overflow-auto transition-all duration-200 ease-out ${
          closing ? "opacity-0 scale-95" : animateIn ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
        style={{
          position: "fixed",
          top: `${position.top}px`,
          left: `${position.left}px`,
          width: `${position.width}px`,
          height: `${position.height}px`,
        }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-2xl">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-background/80 via-background/90 to-background/95" />
              <div className="relative h-full w-full">
                <div className="absolute inset-4 rounded-2xl border border-border/60" />
                <div className="absolute inset-0 flex items-center justify-center px-6 py-8 overflow-auto">
                  <div className="relative flex h-full w-full flex-col gap-4 overflow-hidden">
                    {/* Top controls */}
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-foreground/10 px-4 py-3 shadow-sm backdrop-blur">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onToggleExpand}
                        aria-label={expanded ? "Collapse panel" : "Expand panel"}
                        className="h-9 w-9 rounded-full border border-border/60 bg-background/70 text-foreground hover:bg-foreground/5"
                      >
                        <Plus className={`h-5 w-5 transition-transform ${expanded ? "rotate-45" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        aria-label="Close APCA guidance"
                        className="h-9 w-9 rounded-full border border-border/60 bg-background/70 text-foreground hover:bg-foreground/5"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[200px,1fr]">
                  {/* Center preview card */}
                  <div className="flex items-start justify-center">
                    <div className="relative flex flex-col items-center justify-center rounded-xl border border-border bg-white/95 px-5 py-4 shadow-lg">
                      <div
                        className="flex h-28 w-36 flex-col items-center justify-center rounded-lg border border-border shadow-sm"
                        style={{ backgroundColor: bgColor }}
                      >
                        <span className="text-lg font-semibold" style={{ color: fgColor }}>
                          {`Lc ${lcValue}`}
                        </span>
                        <span
                          className={`mt-2 rounded px-2 py-0.5 text-xs font-semibold ${
                            statusLabel === "Preferred"
                              ? "bg-green-600 text-white"
                              : statusLabel === "Minimum"
                                ? "bg-amber-500 text-black"
                                : "bg-red-600 text-white"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <p className="mt-3 text-center text-xs font-medium text-muted-foreground">Text {fgColor}</p>
                      <p className="text-center text-xs font-medium text-muted-foreground">Background {bgColor}</p>
                    </div>
                    </div>

                  {/* Guidance and use-case checklist */}
                  <div className="flex flex-col gap-3 overflow-auto">
                    <div className="rounded-lg border border-border/60 bg-background/80 p-3 shadow-sm">
                      <p className="text-sm font-semibold text-foreground">Use-case checklist (APCA in a Nutshell)</p>
                      <p className="text-xs text-muted-foreground">
                        Current Lc {lcValue}. Each row shows what this pair supports based on the published APCA ranges.
                      </p>
                      <div className="mt-2 space-y-2 text-[11px]">
                        {[
                          {
                            label: "Body text (14-16px regular)",
                            min: 75,
                            preferred: 90,
                            description: "Columns of fluent reading and dense paragraphs.",
                          },
                          {
                            label: "Large text / key labels (18-24px+)",
                            min: 60,
                            preferred: 75,
                            description: "Headings, important UI labels, larger fluent content.",
                          },
                          {
                            label: "Pictograms & fine icons",
                            min: 45,
                            preferred: 60,
                            description: "Glyphs or icons with fine detail/lines.",
                          },
                          {
                            label: "UI chrome & solid icons",
                            min: 30,
                            preferred: 45,
                            description: "Buttons, borders, solid glyphs, non-text UI.",
                          },
                          {
                            label: "Incidental / decorative",
                            min: 15,
                            preferred: 30,
                            description: "Non-critical/incidental visuals.",
                          },
                        ].map((item) => {
                          const meetsPref = evaluation.lcAbs >= item.preferred
                          const meetsMin = evaluation.lcAbs >= item.min
                          const badgeClass = meetsPref
                            ? "bg-green-600 text-white"
                            : meetsMin
                              ? "bg-amber-500 text-black"
                              : "bg-red-600 text-white"
                          const badgeLabel = meetsPref
                            ? "Preferred"
                            : meetsMin
                              ? "Minimum"
                              : `Need Lc ${item.min}`
                          return (
                            <div key={item.label} className="rounded-md border border-border/50 bg-background/80 p-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-semibold text-foreground">{item.label}</p>
                                  <p className="text-muted-foreground">{item.description}</p>
                                </div>
                                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}>{badgeLabel}</span>
                              </div>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                Min {item.min} - Preferred {item.preferred}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {expanded ? (
                      <>
                        <div className="rounded-lg border border-border/60 bg-background/70 p-3 shadow-sm">
                          <p className="text-sm font-semibold text-foreground">Minimum readable sizes by weight</p>
                          <p className="text-xs text-muted-foreground">{`Based on this pair's Lc ${lcValue}. Sizes below need more contrast; larger sizes may exceed \"preferred\" comfort.`}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {guidanceEntries.map((entry) => (
                            <div key={entry.weightLabel} className="rounded-lg border border-border/60 bg-foreground/5 p-3 text-xs shadow-sm">
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-foreground">{entry.weightLabel}</span>
                                {entry.chosenRow ? (
                                  <span
                                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                                      entry.chosenRow.status === "Preferred"
                                        ? "bg-green-600 text-white"
                                        : "bg-amber-500 text-black"
                                    }`}
                                  >
                                    {entry.chosenRow.status}
                                  </span>
                                ) : (
                                  <span className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">Needs more</span>
                                )}
                              </div>
                              {entry.description && <p className="text-[11px] text-muted-foreground">{entry.description}</p>}
                              {entry.chosenRow ? (
                                <div className="mt-2 flex items-center justify-between rounded bg-background/80 px-2 py-1">
                                  <span className="font-semibold text-foreground">{entry.chosenRow.sizeLabel}</span>
                                  <span className="text-[11px] text-muted-foreground">Min Lc {entry.chosenRow.minLc}</span>
                                </div>
                              ) : (
                                <p className="mt-2 rounded bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
                                  Increase contrast to at least Lc {entry.fallbackMin ?? "-"} for this weight.
                                </p>
                              )}
                              <div className="mt-2 space-y-1 text-[11px]">
                                {entry.rows.map((row) => {
                                  const meets = evaluation.lcAbs >= row.minLc
                                  const meetsPref = typeof row.preferredLc === "number" && evaluation.lcAbs >= row.preferredLc
                                  return (
                                    <div key={`${entry.weightLabel}-${row.sizeLabel}`} className="flex items-center justify-between">
                                      <span className="text-muted-foreground">{row.sizeLabel}</span>
                                      <span
                                        className={`rounded px-2 py-0.5 font-semibold ${
                                          meetsPref
                                            ? "bg-green-600 text-white"
                                            : meets
                                              ? "bg-amber-500 text-black"
                                              : "bg-muted text-muted-foreground"
                                        }`}
                                      >
                                        {meets ? (meetsPref ? "Pref" : "Min") : `Need ${row.minLc}`}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="rounded-lg bg-foreground/5 px-3 py-2 text-[11px] text-muted-foreground shadow-sm">
                          Bronze guidance only. For type-heavy work or specific fonts, verify with the APCA calculator and official
                          lookup tables.
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border/60 bg-background/60 p-3 text-xs text-muted-foreground shadow-sm">
                        {"Detailed weight/size guidance available - use \"Expand\" to view the full table."}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
})

