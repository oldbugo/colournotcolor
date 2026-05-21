"use client"

/* eslint-disable react-hooks/set-state-in-effect */

import React from "react"
import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Minus, Plus, Settings, Shuffle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import {
  extractHexFromColor,
  evaluateContrast,
  CONTRAST_REQUIREMENTS,
} from "@/lib/contrast-utils"
import type {
  ContrastStandard,
  WcagContrastEvaluation,
  ContrastRequirement,
  ApcaContrastEvaluation,
  ContrastRequirementId,
} from "@/lib/contrast-utils"
import type { ColorSwatch, EditingColor } from "@/types/palette"
import { composeLabel, swatchToLegacy } from "@/lib/color-utils"
import type { NumberRange } from "@/lib/storage-utils"
import { CARD_CONTROL_RADII, SEGMENTED_TOGGLE_CLASSNAMES } from "@/lib/design-tokens"
import { getStatusPillBaseClassName, getStatusPillClassName, getStatusPillTone } from "@/lib/status-pill"
import { DragHandle } from "@/components/ui/drag-handle"
import { DropToTrash } from "@/components/dnd/drop-to-trash"
import {
  APCA_BRONZE_MAX_LC,
  extractNumericValue,
  formatLcThresholdLabel,
  formatLcValue,
  formatThresholdLabel,
  getApcaBronzeDescription,
  getApcaBronzeLabel,
  getApcaGradient,
  getApcaMarkerPosition,
  getApcaRequirementForStandard,
  getApcaThresholdsForStandard,
  getOrderedRequirementsForStandard,
  getRequirementLabelForStandard,
  getWcagBarSegmentColors,
  isApcaStandard,
} from "@/components/contrast-grid/apca-helpers"
import {
  FILTER_STEP_MAX_INDEX,
  FILTER_STEP_VALUES,
  useContrastFilters,
} from "@/components/contrast-grid/use-contrast-filters"
import { useGridPan } from "@/components/contrast-grid/use-grid-pan"
import {
  ApcaRangeIndicator,
  BubbleIndicator,
  ConfirmActionButton,
  FocusIndicator,
  ResizeCornerHandle,
  SwatchTile,
} from "@/components/contrast-grid/visual-components"
import { computeDragMode, computeInsertTargetIndex } from "@/lib/index-dnd"
import { computeHorizontalIndicatorPosition, computeVerticalIndicatorPosition } from "@/lib/dnd-indicators"

const CARD_SIZE = 132 // px
const GAP_SIZE = 16 // px (gap-4)
const ANIMATION_DURATION = 0.25 // seconds - faster animation
const CARD_WITH_GAP = CARD_SIZE + GAP_SIZE // 148px
const EXPANDED_CENTER_CARD_WIDTH = 288 // px (w-72)
const EXPANDED_CENTER_CARD_HEIGHT = 160 // px (h-40)
const SLIDER_EDGE_PADDING_PERCENT = 6
const FILTER_CONTROL_SIZE = 40 // px
const FILTER_MENU_MIN_WIDTH = 320
const FILTER_MENU_MIN_HEIGHT = 240
const FILTER_MENU_MAX_WIDTH_RATIO = 0.8
const FILTER_MENU_MAX_HEIGHT_RATIO = 0.7
const UNGROUPED_LABEL = "Ungrouped"
const ROW_LABEL_WIDTH = 164
const HEADER_ROW_HEIGHT = CARD_SIZE + 44
const MATRIX_LEFT_OFFSET = ROW_LABEL_WIDTH + GAP_SIZE
const MATRIX_TOP_OFFSET = HEADER_ROW_HEIGHT + GAP_SIZE
const VIRTUAL_OVERSCAN_ROWS = 3
const VIRTUAL_OVERSCAN_COLUMNS = 2
const DEFAULT_REQUIREMENT_INDEX = Math.max(
  0,
  CONTRAST_REQUIREMENTS.findIndex((requirement) => requirement.id === "normal-text"),
)

const STANDARD_LABELS: Record<ContrastStandard, string> = {
  wcag2: "WCAG 2.x (ratio)",
  "apca-bronze": "APCA Bronze (Lc)",
}

const APCA_OVERLAY_SIZE = 420
const APCA_OVERLAY_MARGIN = 16
const POSITION_EPSILON = 0.5
const APCA_OVERLAY_HEADER_BUFFER = 120
const VIRTUAL_SCROLL_UPDATE_THRESHOLD = CARD_WITH_GAP

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

type VirtualRange = {
  start: number
  end: number
}

type VirtualViewport = {
  scrollLeft: number
  scrollTop: number
  width: number
  height: number
}

const EMPTY_VIRTUAL_RANGE: VirtualRange = { start: 0, end: -1 }
const DEFAULT_VIRTUAL_ITEM_COUNT = 12

const rangeToIndexes = ({ start, end }: VirtualRange) => {
  if (end < start) {
    return []
  }
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
}

const getVirtualRange = ({
  count,
  viewportStart,
  viewportSize,
  itemStride,
  itemOffset,
  overscan,
}: {
  count: number
  viewportStart: number
  viewportSize: number
  itemStride: number
  itemOffset: number
  overscan: number
}): VirtualRange => {
  if (count <= 0) {
    return EMPTY_VIRTUAL_RANGE
  }

  if (viewportSize <= 0) {
    return { start: 0, end: Math.min(count - 1, DEFAULT_VIRTUAL_ITEM_COUNT) }
  }

  const visibleStart = Math.floor((viewportStart - itemOffset) / itemStride)
  const visibleEnd = Math.ceil((viewportStart + viewportSize - itemOffset) / itemStride)

  return {
    start: clamp(visibleStart - overscan, 0, count - 1),
    end: clamp(visibleEnd + overscan, 0, count - 1),
  }
}

const isVirtualRectVisible = ({
  start,
  size,
  viewportStart,
  viewportSize,
  overscan,
}: {
  start: number
  size: number
  viewportStart: number
  viewportSize: number
  overscan: number
}) => start + size >= viewportStart - overscan && start <= viewportStart + viewportSize + overscan



type ColorEntry = {
  id: string
  hex: string
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
  onMiddlePanChange?: (active: boolean) => void
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
  onMiddlePanChange,
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
  const {
    rowFilterIds,
    setRowFilterIds,
    columnFilterIds,
    setColumnFilterIds,
    rowNumberFilter,
    setRowNumberFilter,
    columnNumberFilter,
    setColumnNumberFilter,
    rowNumberInputs,
    setRowNumberInputs,
    columnNumberInputs,
    setColumnNumberInputs,
    filterStepIndex,
    setFilterStepIndex,
  } = useContrastFilters({ paletteId })
  const [focusedNumberInput, setFocusedNumberInput] = useState<HTMLInputElement | null>(null)
  const [isRowFilterMenuOpen, setIsRowFilterMenuOpen] = useState(false)
  const [isColumnFilterMenuOpen, setIsColumnFilterMenuOpen] = useState(false)
  const [isFilterOptionsMenuOpen, setIsFilterOptionsMenuOpen] = useState(false)
  const [isRowRangeExpanded, setIsRowRangeExpanded] = useState(true)
  const [isColumnRangeExpanded, setIsColumnRangeExpanded] = useState(true)
  const [filterMenuSize, setFilterMenuSize] = useState<{ width: number; height: number } | null>(null)
  const [isSwapButtonPressed, setIsSwapButtonPressed] = useState(false)
  const [contrastOverlay, setContrastOverlay] = useState<{
    key: string
    standard: ContrastStandard
    wcagEvaluation: WcagContrastEvaluation | null
    apcaEvaluation: ApcaContrastEvaluation | null
    requirementId: ContrastRequirementId
    requirementLabel: string
    fgColor: string
    bgColor: string
    fgBaseIndex: number | null
    bgBaseIndex: number | null
  } | null>(null)
  const [contrastOverlayExpanded, setContrastOverlayExpanded] = useState(false)
  const [contrastOverlayClosing, setContrastOverlayClosing] = useState(false)
  const [contrastOverlayPosition, setContrastOverlayPosition] = useState<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)
  const standardLabel = STANDARD_LABELS[contrastStandard]

  const getRequirementLabel = useCallback(
    (requirement: ContrastRequirement) => {
      if (contrastStandard === "apca-bronze") {
        return getApcaBronzeLabel(requirement, "label")
      }
      if (isApcaStandard(contrastStandard)) {
        return requirement.apcaLabel ?? requirement.label
      }
      return requirement.label
    },
    [contrastStandard],
  )

  const getRequirementShortLabel = useCallback(
    (requirement: ContrastRequirement) => {
      if (contrastStandard === "apca-bronze") {
        return getApcaBronzeLabel(requirement, "shortLabel")
      }
      if (isApcaStandard(contrastStandard)) {
        return requirement.apcaShortLabel ?? requirement.shortLabel
      }
      return requirement.shortLabel
    },
    [contrastStandard],
  )

  const getRequirementDescription = useCallback(
    (requirement: ContrastRequirement) => {
      if (contrastStandard === "apca-bronze") {
        return getApcaBronzeDescription(requirement)
      }
      if (isApcaStandard(contrastStandard)) {
        return requirement.apcaDescription ?? requirement.description
      }
      return requirement.description
    },
    [contrastStandard],
  )
  useEffect(() => {
    if (!contrastOverlay || contrastOverlay.standard === contrastStandard) {
      return
    }
    setContrastOverlay((current) => {
      if (!current || current.standard === contrastStandard) {
        return current
      }
      return { ...current, standard: contrastStandard }
    })
  }, [contrastOverlay, contrastStandard])

  useEffect(() => {
    if (!contrastOverlay) {
      return
    }
    const fgIndex = contrastOverlay.fgBaseIndex
    const bgIndex = contrastOverlay.bgBaseIndex
    if (typeof fgIndex !== "number" || typeof bgIndex !== "number") {
      return
    }
    const fgSwatch = colors[fgIndex]
    const bgSwatch = colors[bgIndex]
    if (!fgSwatch || !bgSwatch) {
      return
    }
    const fgHex = extractHexFromColor(fgSwatch.hex)
    const bgHex = extractHexFromColor(bgSwatch.hex)
    const requirement =
      CONTRAST_REQUIREMENTS.find((entry) => entry.id === contrastOverlay.requirementId) ?? CONTRAST_REQUIREMENTS[0]
    if (!requirement) {
      return
    }
    const apcaRequirement = getApcaRequirementForStandard(contrastOverlay.standard, requirement)
    const wcagEvaluation = evaluateContrast("wcag2", fgHex, bgHex, requirement)
    const apcaEvaluation = evaluateContrast("apca", fgHex, bgHex, apcaRequirement)
    const requirementLabel = getRequirementLabelForStandard(contrastOverlay.standard, requirement)
    const nextWcag = wcagEvaluation?.standard === "wcag2" ? wcagEvaluation : null
    const nextApca = apcaEvaluation?.standard === "apca" ? apcaEvaluation : null

    setContrastOverlay((current) => {
      if (!current || current.key !== contrastOverlay.key) {
        return current
      }
      const sameColors = current.fgColor === fgHex && current.bgColor === bgHex
      const sameLabel = current.requirementLabel === requirementLabel
      const sameWcag =
        (!current.wcagEvaluation && !nextWcag) ||
        (current.wcagEvaluation &&
          nextWcag &&
          current.wcagEvaluation.ratio === nextWcag.ratio &&
          current.wcagEvaluation.level.aa === nextWcag.level.aa &&
          current.wcagEvaluation.level.aaa === nextWcag.level.aaa)
      const sameApca =
        (!current.apcaEvaluation && !nextApca) ||
        (current.apcaEvaluation &&
          nextApca &&
          current.apcaEvaluation.lc === nextApca.lc &&
          current.apcaEvaluation.lcAbs === nextApca.lcAbs &&
          current.apcaEvaluation.meetsMinimum === nextApca.meetsMinimum &&
          current.apcaEvaluation.meetsPreferred === nextApca.meetsPreferred &&
          current.apcaEvaluation.thresholds.min === nextApca.thresholds.min &&
          current.apcaEvaluation.thresholds.preferred === nextApca.thresholds.preferred)

      if (sameColors && sameLabel && sameWcag && sameApca) {
        return current
      }

      return {
        ...current,
        fgColor: fgHex,
        bgColor: bgHex,
        requirementLabel,
        wcagEvaluation: nextWcag,
        apcaEvaluation: nextApca,
      }
    })
  }, [colors, contrastOverlay])

  useEffect(() => {
    if (!contrastOverlay) {
      setContrastOverlayPosition(null)
    }
  }, [contrastOverlay, contrastOverlayExpanded])

  const gridRef = useRef<HTMLDivElement>(null)
  const fgHeaderRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const bgLabelRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const apcaCellRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const contrastOverlayRef = useRef<HTMLDivElement | null>(null)
  const contrastOverlayContentRef = useRef<HTMLDivElement | null>(null)
  const contrastScrollRef = useRef<HTMLDivElement | null>(null)
  const virtualScrollFrameRef = useRef<number | null>(null)
  const overlayCloseTimeoutRef = useRef<number | null>(null)
  const virtualizedOverlayCloseKeyRef = useRef<string | null>(null)
  const { isMiddlePanning, isMiddlePanningRef } = useGridPan({
    scrollNodeRef: contrastScrollRef,
    onMiddlePanChange,
  })
  const [virtualViewport, setVirtualViewport] = useState<VirtualViewport>({
    scrollLeft: 0,
    scrollTop: 0,
    width: 0,
    height: 0,
  })

  const closeContrastOverlay = useCallback(() => {
    if (!contrastOverlay || contrastOverlayClosing) {
      return
    }
    virtualizedOverlayCloseKeyRef.current = contrastOverlay.key
    setContrastOverlayClosing(true)
    if (overlayCloseTimeoutRef.current) {
      window.clearTimeout(overlayCloseTimeoutRef.current)
    }
    overlayCloseTimeoutRef.current = window.setTimeout(() => {
      setContrastOverlay(null)
      setContrastOverlayClosing(false)
      overlayCloseTimeoutRef.current = null
    }, 200)
  }, [contrastOverlay, contrastOverlayClosing])


  const updateContrastOverlayPosition = useCallback(() => {
    if (!contrastOverlay || typeof window === "undefined") {
      return
    }
    const cellNode = apcaCellRefs.current.get(contrastOverlay.key)
    if (!cellNode) {
      if (virtualizedOverlayCloseKeyRef.current !== contrastOverlay.key) {
        virtualizedOverlayCloseKeyRef.current = contrastOverlay.key
        setContrastOverlay((current) => (current?.key === contrastOverlay.key ? null : current))
      }
      return
    }
    virtualizedOverlayCloseKeyRef.current = null

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

    const contentNode = contrastOverlayContentRef.current ?? contrastOverlayRef.current
    const contentHeight = contentNode?.scrollHeight ?? 0

    const maxExpandedWidth = 900
    const widthTarget = contrastOverlayExpanded ? Math.min(maxExpandedWidth, availableWidth || maxExpandedWidth) : Math.min(APCA_OVERLAY_SIZE, availableWidth || APCA_OVERLAY_SIZE)
    const heightTarget = contrastOverlayExpanded
      ? contentHeight > 0
        ? contentHeight
        : APCA_OVERLAY_SIZE
      : Math.min(APCA_OVERLAY_SIZE + 80, availableHeight || APCA_OVERLAY_SIZE + 80)

    const maxOverlayWidth = contrastOverlayExpanded
      ? Math.min(maxExpandedWidth, availableWidth || maxExpandedWidth)
      : Math.max(availableWidth || widthTarget || APCA_OVERLAY_SIZE, 260)
    const overlayWidth = clamp(widthTarget || APCA_OVERLAY_SIZE, 260, Math.max(maxOverlayWidth, 260))
    const maxOverlayHeight = contrastOverlayExpanded
      ? Math.max(availableHeight || heightTarget, 260)
      : Math.max(availableHeight || heightTarget || APCA_OVERLAY_SIZE, 260)
    const overlayHeight = clamp(heightTarget || APCA_OVERLAY_SIZE, 260, maxOverlayHeight)

    const minLeft = visibleLeft + APCA_OVERLAY_MARGIN
    const maxLeft = visibleRight - overlayWidth - APCA_OVERLAY_MARGIN

    const minTop = visibleTop + APCA_OVERLAY_MARGIN
    const maxTop = visibleBottom - overlayHeight - APCA_OVERLAY_MARGIN

    let left = cellRect.left + cellRect.width / 2 - overlayWidth / 2
    left = clamp(left, minLeft, maxLeft)

    const targetTop = cellRect.top + cellRect.height / 2 - overlayHeight / 2
    let top = clamp(targetTop, minTop, maxTop)
    if (contrastOverlayExpanded) {
      const spaceAbove = cellRect.top - minTop
      if (spaceAbove < overlayHeight * 0.45) {
        top = minTop
      }
    }

    setContrastOverlayPosition((prev) => {
      if (prev && Math.abs(prev.top - top) < POSITION_EPSILON && Math.abs(prev.left - left) < POSITION_EPSILON) {
        return prev
      }
      return { top, left, width: overlayWidth, height: overlayHeight }
    })
  }, [contrastOverlay, contrastOverlayExpanded])

  useEffect(() => {
    if (!contrastOverlay) {
      return
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isMiddlePanningRef.current) {
        return
      }
      const target = event.target as HTMLElement
      const panelToggle = target.closest("[data-panel-toggle]") as HTMLElement | null
      if (panelToggle?.dataset.panelToggle === "Contrast Matrix") {
        closeContrastOverlay()
        return
      }
      if (target.closest("[data-panel-divider]") || target.closest("[data-color-picker]") || panelToggle) {
        return
      }
      if (contrastOverlayRef.current && contrastOverlayRef.current.contains(target)) {
        return
      }
      closeContrastOverlay()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContrastOverlay()
      }
    }
    document.addEventListener("pointerdown", handlePointerDown, true)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [contrastOverlay, closeContrastOverlay, isMiddlePanningRef])


  const measureVirtualViewport = useCallback(() => {
    const node = contrastScrollRef.current
    if (!node) {
      return
    }

    const next = {
      scrollLeft: node.scrollLeft,
      scrollTop: node.scrollTop,
      width: node.clientWidth,
      height: node.clientHeight,
    }

    setVirtualViewport((previous) => {
      const shouldUpdateScrollLeft = Math.abs(previous.scrollLeft - next.scrollLeft) >= VIRTUAL_SCROLL_UPDATE_THRESHOLD
      const shouldUpdateScrollTop = Math.abs(previous.scrollTop - next.scrollTop) >= VIRTUAL_SCROLL_UPDATE_THRESHOLD
      const shouldUpdateWidth = Math.abs(previous.width - next.width) >= POSITION_EPSILON
      const shouldUpdateHeight = Math.abs(previous.height - next.height) >= POSITION_EPSILON
      const isSame =
        !shouldUpdateScrollLeft &&
        !shouldUpdateScrollTop &&
        !shouldUpdateWidth &&
        !shouldUpdateHeight

      if (isSame) {
        return previous
      }

      return {
        scrollLeft: shouldUpdateScrollLeft || shouldUpdateWidth ? next.scrollLeft : previous.scrollLeft,
        scrollTop: shouldUpdateScrollTop || shouldUpdateHeight ? next.scrollTop : previous.scrollTop,
        width: shouldUpdateWidth ? next.width : previous.width,
        height: shouldUpdateHeight ? next.height : previous.height,
      }
    })
  }, [])

  useLayoutEffect(() => {
    const node = contrastScrollRef.current
    if (!node || typeof window === "undefined") {
      return
    }

    const scheduleMeasure = () => {
      if (virtualScrollFrameRef.current !== null) {
        return
      }
      virtualScrollFrameRef.current = window.requestAnimationFrame(() => {
        virtualScrollFrameRef.current = null
        measureVirtualViewport()
      })
    }

    measureVirtualViewport()
    node.addEventListener("scroll", scheduleMeasure, { passive: true })

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scheduleMeasure()
          })
        : null
    observer?.observe(node)

    return () => {
      node.removeEventListener("scroll", scheduleMeasure)
      observer?.disconnect()
      if (virtualScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(virtualScrollFrameRef.current)
        virtualScrollFrameRef.current = null
      }
    }
  }, [measureVirtualViewport])

  useLayoutEffect(() => {
    if (contrastOverlay) {
      updateContrastOverlayPosition()
    }
  }, [contrastOverlay, updateContrastOverlayPosition, colors.length])

  useLayoutEffect(() => {
    if (!contrastOverlay) {
      return
    }
    let firstFrame: number | null = null
    let secondFrame: number | null = null

    firstFrame = window.requestAnimationFrame(() => {
      updateContrastOverlayPosition()
      secondFrame = window.requestAnimationFrame(updateContrastOverlayPosition)
    })

    return () => {
      if (firstFrame !== null) {
        window.cancelAnimationFrame(firstFrame)
      }
      if (secondFrame !== null) {
        window.cancelAnimationFrame(secondFrame)
      }
    }
  }, [contrastOverlay, contrastOverlayExpanded, updateContrastOverlayPosition])

  useEffect(() => {
    if (!contrastOverlay || typeof ResizeObserver === "undefined") {
      return
    }
    const node = contrastOverlayContentRef.current ?? contrastOverlayRef.current
    if (!node) {
      return
    }
    const observer = new ResizeObserver(() => {
      updateContrastOverlayPosition()
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [contrastOverlay, updateContrastOverlayPosition])

  useEffect(() => {
    if (!contrastOverlay) {
      return
    }
    const handleReposition = () => {
      updateContrastOverlayPosition()
    }
    window.addEventListener("scroll", handleReposition, true)
    window.addEventListener("resize", handleReposition)
    return () => {
      window.removeEventListener("scroll", handleReposition, true)
      window.removeEventListener("resize", handleReposition)
    }
  }, [contrastOverlay, updateContrastOverlayPosition])



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
  const rowFilterMenuRef = useRef<HTMLDivElement | null>(null)
  const columnFilterMenuRef = useRef<HTMLDivElement | null>(null)
  const numberFilterStep = FILTER_STEP_VALUES[filterStepIndex] ?? FILTER_STEP_VALUES[0]

  const handleFilterStepSliderChange = useCallback((values: number[]) => {
    const rawValue = values[0]
    if (typeof rawValue !== "number") {
      return
    }
    const clamped = Math.min(FILTER_STEP_MAX_INDEX, Math.max(0, Math.round(rawValue)))
    setFilterStepIndex(clamped)
  }, [setFilterStepIndex])

  const [fgOverlayStyle, setFgOverlayStyle] = useState<React.CSSProperties | null>(null)
  const [bgOverlayStyle, setBgOverlayStyle] = useState<React.CSSProperties | null>(null)

  const [fgSwapHighlightStyle, setFgSwapHighlightStyle] = useState<React.CSSProperties | null>(null)
  const [bgSwapHighlightStyle, setBgSwapHighlightStyle] = useState<React.CSSProperties | null>(null)

  const [requirementId, setRequirementId] = useState<ContrastRequirementId>(
    CONTRAST_REQUIREMENTS[DEFAULT_REQUIREMENT_INDEX]?.id ?? "normal-text",
  )
  const orderedRequirements = useMemo(
    () => getOrderedRequirementsForStandard(contrastStandard),
    [contrastStandard],
  )
  const requirementIndex = useMemo(() => {
    const index = orderedRequirements.findIndex((requirement) => requirement.id === requirementId)
    return index === -1 ? 0 : index
  }, [orderedRequirements, requirementId])
  const activeRequirement = orderedRequirements[requirementIndex] ?? orderedRequirements[0] ?? CONTRAST_REQUIREMENTS[0]
  const hasAAARequirement = typeof activeRequirement.wcagThresholds.aaa === "number"
  const apcaThresholds = getApcaThresholdsForStandard(contrastStandard, activeRequirement)
  const apcaMaxLc =
    contrastStandard === "apca-bronze" ? APCA_BRONZE_MAX_LC[activeRequirement.id] ?? null : null
  const apcaActiveRequirement = getApcaRequirementForStandard(contrastStandard, activeRequirement)
  const hasApcaPreferred = typeof apcaThresholds.preferred === "number"
  const [isRequirementMenuOpen, setIsRequirementMenuOpen] = useState(false)
  const [isRequirementDetailsOpen, setIsRequirementDetailsOpen] = useState(false)
  const requirementLabel = getRequirementLabel(activeRequirement)
  const requirementDescription = getRequirementDescription(activeRequirement)
  const wcagSummaryText = `AA must reach ${formatThresholdLabel(activeRequirement.wcagThresholds.aa)}${
    hasAAARequirement ? ` and AAA ${formatThresholdLabel(activeRequirement.wcagThresholds.aaa!)}` : ""
  }.`
  const apcaSummaryText = `Bronze minimum ${formatLcThresholdLabel(apcaThresholds.min)}${
    hasApcaPreferred ? ` - Preferred ${formatLcThresholdLabel(apcaThresholds.preferred!)}` : ""
  }${apcaMaxLc ? ` - Max ${formatLcThresholdLabel(apcaMaxLc)} (large & bold only)` : ""}.`
  const wcagThresholdText = `AA >= ${formatThresholdLabel(activeRequirement.wcagThresholds.aa)}${
    hasAAARequirement ? ` - AAA >= ${formatThresholdLabel(activeRequirement.wcagThresholds.aaa!)}` : ""
  }`
  const apcaThresholdText = `Bronze minimum >= ${formatLcThresholdLabel(apcaThresholds.min)}${
    hasApcaPreferred ? ` - Preferred >= ${formatLcThresholdLabel(apcaThresholds.preferred!)}` : ""
  }${apcaMaxLc ? ` - Max <= ${formatLcThresholdLabel(apcaMaxLc)} (large & bold only)` : ""}`

  useEffect(() => {
    if (!orderedRequirements.some((requirement) => requirement.id === requirementId)) {
      const fallback = orderedRequirements[0]?.id ?? "normal-text"
      if (fallback !== requirementId) {
        setRequirementId(fallback)
      }
    }
  }, [orderedRequirements, requirementId])

  const handleOverlayRequirementChange = useCallback(
    (nextId: ContrastRequirementId) => {
      setRequirementId(nextId)
      setContrastOverlay((current) => {
        if (!current) {
          return current
        }
        if (current.requirementId === nextId) {
          return current
        }
        return { ...current, requirementId: nextId }
      })
    },
    [setRequirementId],
  )

  const handleOverlayStandardChange = useCallback(
    (nextStandard: ContrastStandard) => {
      if (!onContrastStandardChange) {
        return
      }
      onContrastStandardChange(nextStandard)
      setContrastOverlay((current) => {
        if (!current || current.standard === nextStandard) {
          return current
        }
        return { ...current, standard: nextStandard }
      })
    },
    [onContrastStandardChange],
  )

const colorEntries = useMemo<ColorEntry[]>(
    () =>
      colors.map((swatch, index) => {
        const groupLabel = swatch.group?.trim() || UNGROUPED_LABEL
        const groupKey = swatch.group?.trim().toLowerCase() || "__ungrouped__"
        const numericValue = extractNumericValue(swatch)
        return {
          id: swatch.id,
          hex: extractHexFromColor(swatch.hex),
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
  }, [clampRangeToBounds, numericBounds, setColumnNumberFilter, setRowNumberFilter])

  useEffect(() => {
    if (!focusedNumberInput || typeof window === "undefined") {
      return
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
    }
    const options: AddEventListenerOptions = { passive: false }
    window.addEventListener("wheel", handleWheel, options)
    return () => {
      window.removeEventListener("wheel", handleWheel, options)
    }
  }, [focusedNumberInput])

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

  const foregroundColors = useMemo(() => columnEntries.map((entry) => entry.legacy), [columnEntries])
  const backgroundColors = useMemo(() => rowEntries.map((entry) => entry.legacy), [rowEntries])
  const foregroundHexColors = useMemo(() => columnEntries.map((entry) => entry.hex), [columnEntries])
  const backgroundHexColors = useMemo(() => rowEntries.map((entry) => entry.hex), [rowEntries])
  const foregroundLabels = useMemo(() => columnEntries.map((entry) => entry.label || entry.hex), [columnEntries])
  const backgroundLabels = useMemo(() => rowEntries.map((entry) => entry.label || entry.hex), [rowEntries])
  const foregroundBaseIndexes = useMemo(() => columnEntries.map((entry) => entry.baseIndex), [columnEntries])
  const backgroundBaseIndexes = useMemo(() => rowEntries.map((entry) => entry.baseIndex), [rowEntries])

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
      return "All backgrounds and foregrounds are filtered out."
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
  }, [
    numericBounds,
    setColumnFilterIds,
    setColumnNumberFilter,
    setRowFilterIds,
    setRowNumberFilter,
  ])

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
  }, [
    columnFilterIds,
    rowFilterIds,
    columnNumberFilter,
    rowNumberFilter,
    setColumnFilterIds,
    setColumnNumberFilter,
    setRowFilterIds,
    setRowNumberFilter,
  ])

  const beginFilterMenuResize = useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      menuRef: React.RefObject<HTMLDivElement | null>,
      setSize: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>,
      anchor: "bottom-left" | "bottom-right",
    ) => {
      event.preventDefault()
      event.stopPropagation()
      const menu = menuRef.current
      if (!menu || typeof window === "undefined") {
        return
      }

      const startRect = menu.getBoundingClientRect()
      const startX = event.clientX
      const startY = event.clientY
      const startWidth = startRect.width
      const startHeight = startRect.height
      const maxWidth = Math.max(FILTER_MENU_MIN_WIDTH, window.innerWidth * FILTER_MENU_MAX_WIDTH_RATIO)
      const maxHeight = Math.max(FILTER_MENU_MIN_HEIGHT, window.innerHeight * FILTER_MENU_MAX_HEIGHT_RATIO)

      setSize({ width: startWidth, height: startHeight })

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX
        const deltaY = moveEvent.clientY - startY
        const widthDelta = anchor === "bottom-left" ? -deltaX : deltaX
        const nextHeight = clamp(startHeight + deltaY, FILTER_MENU_MIN_HEIGHT, maxHeight)
        const nextWidth =
          anchor === "bottom-left"
            ? clamp(startWidth + widthDelta, FILTER_MENU_MIN_WIDTH, maxWidth)
            : clamp(startWidth, FILTER_MENU_MIN_WIDTH, maxWidth)
        setSize({ width: nextWidth, height: nextHeight })
      }

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", handlePointerUp)
        window.removeEventListener("pointercancel", handlePointerUp)
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerUp)
      window.addEventListener("pointercancel", handlePointerUp)
    },
    [],
  )

const renderFilterGroups = (
  effectiveSet: Set<string> | null,
  toggleSingle: (id: string) => void,
  toggleGroup: (ids: string[]) => void,
  collapsedSet: Set<string>,
  onToggleCollapse: (key: string) => void,
  numberFilter: NumberRange | null,
) => {
  if (groupedColorEntries.length === 0) {
    return <div className="px-2 py-1 text-xs text-muted-foreground">No colors available</div>
  }
  return (
    <div className="space-y-2 pr-1">
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
          <div key={group.key} className="rounded-md border border-border/40 bg-muted/5 px-2 py-1">
            <div
              role="button"
              tabIndex={0}
              className="flex w-full cursor-pointer items-center justify-between rounded-md px-1.5 py-1 text-xs font-semibold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
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
              >
                <span>{selectedCount}/{group.entries.length}</span>
                <span className="flex h-9 w-5 items-center justify-end rounded-full pr-0">
                  <span className={`h-3 w-5 rounded-full border transition-colors ${indicatorClass}`} aria-hidden="true" />
                </span>
              </button>
            </div>
            <div
              className={`overflow-hidden transition-[max-height,opacity] duration-150 ease-out ${
                isCollapsed ? "max-h-0 opacity-0 pointer-events-none" : "max-h-80 opacity-100"
              }`}
              aria-hidden={isCollapsed}
            >
              <div className="mt-1 space-y-1">
                {group.entries.map((entry) => {
                  const isSelected = effectiveSet ? effectiveSet.has(entry.id) : true
                  const passesRange = passesNumberFilter(entry, numberFilter)
                  const isFilteredByRange = !passesRange
                  const showFilteredTag = isFilteredByRange
                  const isMutedByFiltering = isFilteredByRange
                  const labelParts = entry.label.split("/")
                  const displayLabel = labelParts[labelParts.length - 1]?.trim() || entry.label
                  const hexColor = extractHexFromColor(entry.legacy)
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1 text-sm ${
                        isMutedByFiltering ? "text-muted-foreground" : "text-foreground"
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
                        {showFilteredTag && (
                          <span className="rounded-full border border-muted-foreground/40 bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Filtered
                          </span>
                        )}
                      </span>
                      <span
                        className={`h-3 w-3 rounded-full border ${
                          isSelected
                            ? isMutedByFiltering
                              ? "bg-muted-foreground/60 border-muted-foreground/70"
                              : "bg-foreground border-foreground"
                            : "border-muted-foreground/40"
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  )
                })}
              </div>
            </div>
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
  expanded: boolean,
  onToggleExpanded: () => void,
) => {
  const normalizedRange = clampRangeToBounds(filter) ?? (numericBounds ? { ...numericBounds } : null)
  const isRangeActive = Boolean(
    numericBounds &&
      normalizedRange &&
      (normalizedRange.min !== numericBounds.min || normalizedRange.max !== numericBounds.max),
  )
  if (!numericBounds || !normalizedRange) {
    return (
      <div className="rounded-md border border-dashed border-muted-foreground/40 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            onClick={() => onToggleExpanded()}
          >
            <span className="text-base leading-none">{expanded ? "\u2212" : "+"}</span>
            <span>{label}</span>
          </button>
        </div>
        {expanded && (
          <div className="mt-2">
            Add numeric names (e.g., &ldquo;Red/100&rdquo;) to unlock range filtering.
          </div>
        )}
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

    const applyWheelStep = (field: "min" | "max", deltaY: number) => {
      const direction = deltaY > 0 ? 1 : -1
      const step = numberFilterStep
      const otherField = field === "min" ? "max" : "min"
      const fallback = field === "min" ? sliderValues[0] : sliderValues[1]
      const otherFallback = otherField === "min" ? sliderValues[0] : sliderValues[1]
      const currentRaw = inputValues[field].trim()
      const otherRaw = inputValues[otherField].trim()
      const currentValue = Number.isFinite(Number(currentRaw)) ? Number(currentRaw) : fallback
      const otherValue = Number.isFinite(Number(otherRaw)) ? Number(otherRaw) : otherFallback
      const nextValue = clamp(currentValue + direction * step, numericBounds.min, numericBounds.max)
      const boundedOther = clamp(otherValue, numericBounds.min, numericBounds.max)

      if (field === "min") {
        const nextMin = Math.min(nextValue, boundedOther)
        const nextMax = Math.max(boundedOther, nextMin)
        const nextRange = clampRangeToBounds({ min: nextMin, max: nextMax })
        if (nextRange) {
          setFilter(nextRange)
          setInputValues({ min: nextRange.min.toString(), max: nextRange.max.toString() })
        }
      } else {
        const nextMax = Math.max(nextValue, boundedOther)
        const nextMin = Math.min(boundedOther, nextMax)
        const nextRange = clampRangeToBounds({ min: nextMin, max: nextMax })
        if (nextRange) {
          setFilter(nextRange)
          setInputValues({ min: nextRange.min.toString(), max: nextRange.max.toString() })
        }
      }
    }

    return (
      <div className="rounded-md border border-border/60 bg-muted/20 p-3">
        <div
          className={`flex items-center justify-between text-xs font-semibold uppercase tracking-wide ${
            isRangeActive ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2"
            onClick={() => onToggleExpanded()}
          >
            <span className="text-base leading-none">{expanded ? "\u2212" : "+"}</span>
            <span>{label}</span>
          </button>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isRangeActive
                ? "border-foreground/40 bg-foreground/5 text-foreground"
                : "border-muted-foreground/30 bg-muted/30 text-muted-foreground"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 cursor-pointer rounded-full ${
                isRangeActive ? "bg-foreground" : "bg-muted-foreground/60"
              }`}
              aria-hidden="true"
            />
            {isRangeActive ? "Active" : "Inactive"}
          </span>
        </div>
        {expanded && (
          <>
            <div className="mt-3 flex items-center gap-4 text-sm">
              <label className="text-xs font-medium text-muted-foreground">Min</label>
              <Input
                type="number"
                inputMode="numeric"
                step={numberFilterStep}
                value={inputValues.min}
                onChange={(event) => handleInputChange("min", event.currentTarget.value)}
                onFocus={(event) => setFocusedNumberInput(event.currentTarget)}
                onBlur={(event) => {
                  commitInputValue("min")
                  if (focusedNumberInput === event.currentTarget) {
                    setFocusedNumberInput(null)
                  }
                }}
                onWheel={(event) => {
                  if (document.activeElement !== event.currentTarget) {
                    return
                  }
                  event.preventDefault()
                  applyWheelStep("min", event.deltaY)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    commitInputValue("min")
                  }
                }}
                className="h-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <label className="text-xs font-medium text-muted-foreground">Max</label>
              <Input
                type="number"
                inputMode="numeric"
                step={numberFilterStep}
                value={inputValues.max}
                onChange={(event) => handleInputChange("max", event.currentTarget.value)}
                onFocus={(event) => setFocusedNumberInput(event.currentTarget)}
                onBlur={(event) => {
                  commitInputValue("max")
                  if (focusedNumberInput === event.currentTarget) {
                    setFocusedNumberInput(null)
                  }
                }}
                onWheel={(event) => {
                  if (document.activeElement !== event.currentTarget) {
                    return
                  }
                  event.preventDefault()
                  applyWheelStep("max", event.deltaY)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    commitInputValue("max")
                  }
                }}
                className="h-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <div className="mt-3 px-1">
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
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{sliderValues[0]}</span>
              <span>{sliderValues[1]}</span>
            </div>
            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                className="cursor-pointer text-xs font-semibold text-foreground underline-offset-2 hover:underline"
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
          </>
        )}
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
  const matrixWidth = ROW_LABEL_WIDTH + GAP_SIZE + foregroundColors.length * CARD_WITH_GAP + CARD_SIZE
  const matrixHeight = HEADER_ROW_HEIGHT + GAP_SIZE + backgroundColors.length * CARD_WITH_GAP + CARD_SIZE
  const bottomAddRowTop = MATRIX_TOP_OFFSET + backgroundColors.length * CARD_WITH_GAP
  const addColumnLeft = MATRIX_LEFT_OFFSET + foregroundColors.length * CARD_WITH_GAP
  const visibleColumnRange = useMemo(
    () =>
      getVirtualRange({
        count: foregroundColors.length,
        viewportStart: virtualViewport.scrollLeft,
        viewportSize: virtualViewport.width,
        itemStride: CARD_WITH_GAP,
        itemOffset: MATRIX_LEFT_OFFSET,
        overscan: VIRTUAL_OVERSCAN_COLUMNS,
      }),
    [foregroundColors.length, virtualViewport.scrollLeft, virtualViewport.width],
  )
  const visibleRowRange = useMemo(
    () =>
      getVirtualRange({
        count: backgroundColors.length,
        viewportStart: virtualViewport.scrollTop,
        viewportSize: virtualViewport.height,
        itemStride: CARD_WITH_GAP,
        itemOffset: MATRIX_TOP_OFFSET,
        overscan: VIRTUAL_OVERSCAN_ROWS,
      }),
    [backgroundColors.length, virtualViewport.height, virtualViewport.scrollTop],
  )
  const visibleColumnIndexes = useMemo(() => rangeToIndexes(visibleColumnRange), [visibleColumnRange])
  const visibleRowIndexes = useMemo(() => rangeToIndexes(visibleRowRange), [visibleRowRange])
  const isHeaderRowVisible = isVirtualRectVisible({
    start: 0,
    size: HEADER_ROW_HEIGHT,
    viewportStart: virtualViewport.scrollTop,
    viewportSize: virtualViewport.height,
    overscan: CARD_WITH_GAP,
  })
  const isBottomAddRowVisible = isVirtualRectVisible({
    start: bottomAddRowTop,
    size: CARD_SIZE,
    viewportStart: virtualViewport.scrollTop,
    viewportSize: virtualViewport.height,
    overscan: CARD_WITH_GAP,
  })
  const isAddColumnVisible = isVirtualRectVisible({
    start: addColumnLeft,
    size: CARD_SIZE,
    viewportStart: virtualViewport.scrollLeft,
    viewportSize: virtualViewport.width,
    overscan: CARD_WITH_GAP,
  })

  return (
    <div className="flex h-full min-h-[320px] min-w-0 flex-col overflow-hidden pb-4 pl-4 pt-4 pr-0">
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

      <div className="mb-6 flex shrink-0 flex-wrap gap-4">
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
              className="w-[420px] max-w-[460px] space-y-4 border border-border bg-background/95 p-4 text-foreground shadow-lg backdrop-blur"
              style={{ borderRadius: CARD_CONTROL_RADII.elevated }}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requirement focus</p>
                  <div className={SEGMENTED_TOGGLE_CLASSNAMES.container}>
                    <button
                      type="button"
                      onClick={() => onContrastStandardChange?.("wcag2")}
                      className={`${SEGMENTED_TOGGLE_CLASSNAMES.option} ${
                        contrastStandard === "wcag2"
                          ? SEGMENTED_TOGGLE_CLASSNAMES.optionActive
                          : SEGMENTED_TOGGLE_CLASSNAMES.optionInactive
                      }`}
                      aria-pressed={contrastStandard === "wcag2"}
                    >
                      WCAG
                    </button>
                    <button
                      type="button"
                      onClick={() => onContrastStandardChange?.("apca-bronze")}
                      className={`${SEGMENTED_TOGGLE_CLASSNAMES.option} ${
                        contrastStandard === "apca-bronze"
                          ? SEGMENTED_TOGGLE_CLASSNAMES.optionActive
                          : SEGMENTED_TOGGLE_CLASSNAMES.optionInactive
                      }`}
                      aria-pressed={contrastStandard === "apca-bronze"}
                      aria-label="APCA Bronze"
                    >
                      APCA Bronze
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">{requirementLabel}</p>
                  <p className="text-xs text-muted-foreground">{requirementDescription}</p>
                </div>
                {contrastStandard === "wcag2" ? (
                  <p className="text-xs text-muted-foreground">{wcagSummaryText}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{apcaSummaryText}</p>
                )}
              </div>
              {contrastStandard === "wcag2" ? (
                <div className="text-xs font-medium text-muted-foreground">
                  <p>{wcagThresholdText}</p>
                </div>
              ) : (
                <div className="text-xs font-medium text-muted-foreground">
                  <p>{apcaThresholdText}</p>
                </div>
              )}
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
                        <p>APCA Bronze covers primary content text only; it is the minimum conformance level.</p>
                        <p>No font lookup table; uses general conformance levels.</p>
                        <p>Use cases: body text, other content text, and large fluent content.</p>
                        <p>Spot text and logos are not covered.</p>
                        <p>Large fluent content has a max Lc 90 for large & bold text.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, orderedRequirements.length - 1)}
                  step={1}
                  value={requirementIndex}
                  aria-label={`Set ${standardLabel} requirement focus`}
                  aria-valuetext={`${requirementLabel} requirement (${standardLabel})`}
                  onChange={(event) => {
                    const nextIndex = Number(event.currentTarget.value)
                    const nextRequirement = orderedRequirements[nextIndex]
                    if (nextRequirement) {
                      setRequirementId(nextRequirement.id)
                    }
                  }}
                  className="w-full accent-foreground cursor-pointer transition-[transform,filter] duration-200 focus:brightness-110 active:brightness-125 active:scale-[1.01]"
                />
              </div>
              <div className="grid w-full grid-cols-3 gap-2 text-xs font-medium text-muted-foreground">
                {orderedRequirements.map((option) => {
                  const isActive = option.id === activeRequirement.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setRequirementId(option.id)
                      }}
                      className={`w-full rounded-full px-3 py-1 text-center leading-snug transition-all duration-150 ${
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
            aria-label="Swap background and foreground filters"
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
                Background: {rowFilterSummary}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    isRowFilterMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              ref={rowFilterMenuRef}
              style={filterMenuSize ? { width: filterMenuSize.width, height: filterMenuSize.height } : undefined}
              className="relative w-[420px] min-w-[320px] max-w-[80vw] min-h-[240px] max-h-[70vh] overflow-visible border border-border bg-background/95 p-3 shadow-lg backdrop-blur flex flex-col gap-3"
            >
              <div className="flex-1 min-h-0 overflow-auto space-y-3 pr-1">
                {renderNumberFilterSection(
                  "Range Filter",
                  rowNumberFilter,
                  setRowNumberFilter,
                  rowNumberInputs,
                  setRowNumberInputs,
                  isRowRangeExpanded,
                  () => setIsRowRangeExpanded((prev) => !prev),
                )}
                <div className="h-px bg-border/40" />
                <div className="flex items-center justify-end gap-2 pr-2 text-[11px] font-medium text-muted-foreground">
                  <button
                    type="button"
                    className="cursor-pointer hover:text-foreground"
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
                    className="cursor-pointer hover:text-foreground"
                    onClick={(event) => {
                      event.preventDefault()
                      expandAllGroups()
                    }}
                  >
                    Expand all
                  </button>
                </div>
                {renderFilterGroups(
                  effectiveRowFilterIds,
                  toggleRowFilterValue,
                  toggleRowGroupValue,
                  collapsedGroupKeys,
                  toggleGroupCollapse,
                  rowNumberFilter,
                )}
              </div>
              <div className="flex gap-2">
                <ConfirmActionButton
                  variant="clear"
                  description="This will clear every background from your selection."
                  onConfirm={clearAllRows}
                />
                <ConfirmActionButton
                  variant="select"
                  description="This will add every background back into your selection."
                  onConfirm={selectAllRows}
                />
              </div>
              <ResizeCornerHandle
                position="left"
                onPointerDown={(event) =>
                  beginFilterMenuResize(event, rowFilterMenuRef, setFilterMenuSize, "bottom-left")
                }
              />
              <ResizeCornerHandle
                position="right"
                onPointerDown={(event) =>
                  beginFilterMenuResize(event, rowFilterMenuRef, setFilterMenuSize, "bottom-right")
                }
              />
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
                Foreground: {columnFilterSummary}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    isColumnFilterMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              ref={columnFilterMenuRef}
              style={filterMenuSize ? { width: filterMenuSize.width, height: filterMenuSize.height } : undefined}
              className="relative w-[420px] min-w-[320px] max-w-[80vw] min-h-[240px] max-h-[70vh] overflow-visible border border-border bg-background/95 p-3 shadow-lg backdrop-blur flex flex-col gap-3"
            >
              <div className="flex-1 min-h-0 overflow-auto space-y-3 pr-1">
                {renderNumberFilterSection(
                  "Range Filter",
                  columnNumberFilter,
                  setColumnNumberFilter,
                  columnNumberInputs,
                  setColumnNumberInputs,
                  isColumnRangeExpanded,
                  () => setIsColumnRangeExpanded((prev) => !prev),
                )}
                <div className="h-px bg-border/40" />
                <div className="flex items-center justify-end gap-2 pr-2 text-[11px] font-medium text-muted-foreground">
                  <button
                    type="button"
                    className="cursor-pointer hover:text-foreground"
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
                    className="cursor-pointer hover:text-foreground"
                    onClick={(event) => {
                      event.preventDefault()
                      expandAllGroups()
                    }}
                  >
                    Expand all
                  </button>
                </div>
                {renderFilterGroups(
                  effectiveColumnFilterIds,
                  toggleColumnFilterValue,
                  toggleColumnGroupValue,
                  collapsedGroupKeys,
                  toggleGroupCollapse,
                  columnNumberFilter,
                )}
              </div>
              <div className="flex gap-2">
                <ConfirmActionButton
                  variant="clear"
                  description="This will clear every foreground from your selection."
                  onConfirm={clearAllColumns}
                />
                <ConfirmActionButton
                  variant="select"
                  description="This will add every foreground back into your selection."
                  onConfirm={selectAllColumns}
                />
              </div>
              <ResizeCornerHandle
                position="left"
                onPointerDown={(event) =>
                  beginFilterMenuResize(event, columnFilterMenuRef, setFilterMenuSize, "bottom-left")
                }
              />
              <ResizeCornerHandle
                position="right"
                onPointerDown={(event) =>
                  beginFilterMenuResize(event, columnFilterMenuRef, setFilterMenuSize, "bottom-right")
                }
              />
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
                Adjust how much the background and foreground number sliders move whenever you drag or tap them.
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
        className="contrast-scroll-area min-h-0 flex-1 overflow-auto pb-4 pl-4 pr-0 pt-4"
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
          <div
            ref={gridRef}
            className="relative overflow-visible"
            style={{ width: `${matrixWidth}px`, height: `${matrixHeight}px` }}
            onDragOver={handleGridDragOver}
            onDrop={(e) => {
              handleFgDrop(e)
              handleBgDrop(e)
            }}
          >
            {fgIndicatorPosition && fgDragMode === "insert" && (
              <div
                className="absolute w-1 rounded-full bg-blue-500 pointer-events-none z-30"
                style={{
                  left: `${fgIndicatorPosition.left}px`,
                  top: `${fgIndicatorPosition.top}px`,
                  height: fgIndicatorPosition.height ? `${fgIndicatorPosition.height}px` : "100%",
                }}
              />
            )}

            {bgIndicatorPosition && bgDragMode === "insert" && (
              <div
                className="absolute h-1 rounded-full bg-blue-500 pointer-events-none z-30"
                style={{
                  left: `${bgIndicatorPosition.left}px`,
                  top: `${bgIndicatorPosition.top}px`,
                  width: bgIndicatorPosition.width ? `${bgIndicatorPosition.width}px` : "100%",
                }}
              />
            )}

            <div
              className="absolute"
              style={{ left: 0, top: 0, width: ROW_LABEL_WIDTH, height: HEADER_ROW_HEIGHT }}
              onDragOver={handleBgGapDragOver}
              onDrop={handleBgDrop}
            />

            {isHeaderRowVisible &&
              visibleColumnIndexes.map((i) => {
                const isDragging = draggedFgIndex === i
                const isEditing = editingColumnIndex === i
                const hexColor = foregroundHexColors[i] ?? extractHexFromColor(foregroundColors[i] ?? "")
                const displayText = foregroundLabels[i] ?? hexColor

                return (
                  <div
                    key={columnEntries[i]?.id ?? i}
                    ref={(el) => {
                      if (el) {
                        fgHeaderRefs.current.set(i, el)
                      } else {
                        fgHeaderRefs.current.delete(i)
                      }
                    }}
                    className="absolute flex items-center flex-col transition-all duration-200 overflow-visible"
                    style={{
                      left: `${MATRIX_LEFT_OFFSET + i * CARD_WITH_GAP}px`,
                      top: 0,
                      width: `${CARD_SIZE}px`,
                      height: `${HEADER_ROW_HEIGHT}px`,
                      opacity: isDragging ? 0.5 : 1,
                      transform: isDragging ? "scale(0.95)" : "scale(1)",
                      ...getFgAnimationStyle(i),
                    }}
                    onDragOver={(e) => handleFgDragOver(e, i)}
                    onDrop={handleFgDrop}
                    data-color-card
                  >
                    {isEditing && <FocusIndicator />}

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

                    <SwatchTile hexColor={hexColor} label={displayText} onClick={(e) => handleFgHeaderClick(i, e)} />
                  </div>
                )
              })}

            {isHeaderRowVisible && isAddColumnVisible && (
              <div
                className="absolute flex items-center flex-col"
                style={{
                  left: `${addColumnLeft}px`,
                  top: 0,
                  width: `${CARD_SIZE}px`,
                  height: `${HEADER_ROW_HEIGHT}px`,
                }}
              >
                <div className="mb-1 flex cursor-grab active:cursor-grabbing flex-col gap-1 rounded p-2 opacity-0 pointer-events-none">
                  <div className="h-0.5 w-8 rounded-full bg-foreground/40" />
                  <div className="h-0.5 w-8 rounded-full bg-foreground/40" />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="bg-transparent cursor-pointer border border-border hover:bg-foreground/5 rounded-md"
                  style={{ height: `${CARD_SIZE}px`, width: `${CARD_SIZE}px` }}
                  onClick={() => onAddColor?.()}
                >
                  <Plus className="h-8 w-8" />
                </Button>
              </div>
            )}

            {visibleRowIndexes.map((bgIndex) => {
              const rowTop = MATRIX_TOP_OFFSET + bgIndex * CARD_WITH_GAP
              const isBgDragging = draggedBgIndex === bgIndex
              const isEditing = editingRowIndex === bgIndex
              const bgHexColor = backgroundHexColors[bgIndex] ?? extractHexFromColor(backgroundColors[bgIndex] ?? "")
              const bgDisplayText = backgroundLabels[bgIndex] ?? bgHexColor

              return (
                <React.Fragment key={rowEntries[bgIndex]?.id ?? bgIndex}>
                  <div
                    ref={(el) => {
                      if (el) {
                        bgLabelRefs.current.set(bgIndex, el)
                      } else {
                        bgLabelRefs.current.delete(bgIndex)
                      }
                    }}
                    className="absolute flex items-center transition-all duration-200 pr-0 mr-0 gap-2 overflow-visible"
                    style={{
                      left: 0,
                      top: `${rowTop}px`,
                      width: `${ROW_LABEL_WIDTH}px`,
                      height: `${CARD_SIZE}px`,
                      opacity: isBgDragging ? 0.5 : 1,
                      transform: isBgDragging ? "scale(0.95)" : "scale(1)",
                      ...getBgAnimationStyle(bgIndex),
                    }}
                    onDragOver={(e) => handleBgDragOver(e, bgIndex)}
                    onDrop={handleBgDrop}
                    data-color-card
                  >
                    {isEditing && <FocusIndicator />}

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
                      <SwatchTile
                        hexColor={bgHexColor}
                        label={bgDisplayText}
                        onClick={(e) => handleBgHeaderClick(bgIndex, e)}
                      />
                    </div>
                  </div>

                  {visibleColumnIndexes.map((fgIndex) => {
                    const isFgDragging = draggedFgIndex === fgIndex
                    const fgHexColor = foregroundHexColors[fgIndex] ?? extractHexFromColor(foregroundColors[fgIndex] ?? "")
                    const wcagEvaluation =
                      contrastStandard === "wcag2"
                        ? evaluateContrast("wcag2", fgHexColor, bgHexColor, activeRequirement)
                        : null
                    const apcaEvaluation =
                      isApcaStandard(contrastStandard)
                        ? evaluateContrast("apca", fgHexColor, bgHexColor, apcaActiveRequirement)
                        : null
                    const cellKey = `${bgIndex}-${fgIndex}`
                    const showOverlayToggle = Boolean(wcagEvaluation || apcaEvaluation)

                    let valueDisplay: React.ReactNode = "-"
                    const valueClassName = "relative z-10 text-xl font-bold"
                    let badgeContent: React.ReactNode = (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">N/A</span>
                    )
                    const badgeWrapperClass = "relative z-10 mt-2 flex gap-1"
                    let cellLabel = `Contrast unavailable for ${requirementLabel}, ${standardLabel}`

                    if (contrastStandard === "wcag2" && wcagEvaluation?.standard === "wcag2") {
                      const ratioText = wcagEvaluation.ratio.toFixed(2)
                      valueDisplay = ratioText
                      badgeContent = (
                        <>
                          {wcagEvaluation.level.aa && (
                            <span className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white">AA</span>
                          )}
                          {hasAAARequirement && wcagEvaluation.level.aaa && (
                            <span className="rounded bg-green-700 px-2 py-0.5 text-xs font-medium text-white">AAA</span>
                          )}
                          {!wcagEvaluation.level.aa && (
                            <span className={getStatusPillClassName("fail", "sm")}>Fail</span>
                          )}
                        </>
                      )

                      cellLabel = `Contrast ratio ${ratioText}:1, ${
                        wcagEvaluation.level.aa ? "AA pass" : "AA fail"
                      }${hasAAARequirement ? `, ${wcagEvaluation.level.aaa ? "AAA pass" : "AAA fail"}` : ""}, ${requirementLabel}, ${standardLabel}.`
                    } else if (isApcaStandard(contrastStandard) && apcaEvaluation?.standard === "apca") {
                      const formattedLc = formatLcValue(apcaEvaluation.lcAbs)
                      valueDisplay = `Lc ${formattedLc}`
                      const isBronze = contrastStandard === "apca-bronze"
                      const maxLc =
                        contrastStandard === "apca-bronze" ? APCA_BRONZE_MAX_LC[activeRequirement.id] ?? null : null
                      const status = isBronze
                        ? apcaEvaluation.meetsMinimum
                          ? { label: "Pass", className: getStatusPillClassName("pass", "sm") }
                          : { label: "Fail", className: getStatusPillClassName("fail", "sm") }
                        : apcaEvaluation.meetsPreferred
                          ? {
                              label: "Preferred",
                              className: `${getStatusPillBaseClassName("sm")} bg-green-600 text-white`,
                            }
                          : apcaEvaluation.meetsMinimum
                            ? {
                                label: "Minimum",
                                className: `${getStatusPillBaseClassName("sm")} bg-amber-500 text-black`,
                              }
                            : {
                                label: "Below min",
                                className: `${getStatusPillBaseClassName("sm")} bg-red-600 text-white`,
                              }

                      badgeContent = <span className={status.className}>{status.label}</span>

                      cellLabel = `APCA contrast Lc ${formattedLc}, ${
                        isBronze
                          ? apcaEvaluation.meetsMinimum
                            ? "pass"
                            : "fail"
                          : apcaEvaluation.meetsPreferred
                            ? "meets preferred readability"
                            : apcaEvaluation.meetsMinimum
                              ? "meets minimum readability"
                              : "below minimum readability"
                      }${maxLc && apcaEvaluation.lcAbs > maxLc ? `, above max ${formatLcThresholdLabel(maxLc)}` : ""}, ${requirementLabel}, ${standardLabel}.`
                    }

                    const handleOverlayToggle = () => {
                      if (!showOverlayToggle) {
                        return
                      }
                      const nextWcagEvaluation =
                        wcagEvaluation ?? evaluateContrast("wcag2", fgHexColor, bgHexColor, activeRequirement)
                      const nextApcaEvaluation =
                        apcaEvaluation ?? evaluateContrast("apca", fgHexColor, bgHexColor, apcaActiveRequirement)
                      setContrastOverlay((current) => {
                        if (current?.key === cellKey) {
                          return null
                        }
                        if (overlayCloseTimeoutRef.current) {
                          window.clearTimeout(overlayCloseTimeoutRef.current)
                          overlayCloseTimeoutRef.current = null
                        }
                        setContrastOverlayClosing(false)
                        setContrastOverlayExpanded(false)
                        return {
                          key: cellKey,
                          standard: contrastStandard,
                          wcagEvaluation: nextWcagEvaluation?.standard === "wcag2" ? nextWcagEvaluation : null,
                          apcaEvaluation: nextApcaEvaluation?.standard === "apca" ? nextApcaEvaluation : null,
                          requirementId: activeRequirement.id,
                          requirementLabel,
                          fgColor: fgHexColor,
                          bgColor: bgHexColor,
                          fgBaseIndex: foregroundBaseIndexes[fgIndex] ?? null,
                          bgBaseIndex: backgroundBaseIndexes[bgIndex] ?? null,
                        }
                      })
                    }

                    const interactiveProps = showOverlayToggle
                      ? {
                          role: "button" as const,
                          tabIndex: 0,
                          onClick: handleOverlayToggle,
                          onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault()
                              handleOverlayToggle()
                            }
                          },
                          "aria-expanded": contrastOverlay?.key === cellKey,
                        }
                      : {}

                    return (
                      <div
                        key={`${rowEntries[bgIndex]?.id ?? bgIndex}-${columnEntries[fgIndex]?.id ?? fgIndex}`}
                        ref={(node) => {
                          if (node) {
                            apcaCellRefs.current.set(cellKey, node)
                          } else {
                            apcaCellRefs.current.delete(cellKey)
                          }
                        }}
                        className="absolute flex flex-col items-center justify-center border border-border transition-all duration-200 rounded-md"
                        style={{
                          left: `${MATRIX_LEFT_OFFSET + fgIndex * CARD_WITH_GAP}px`,
                          top: `${rowTop}px`,
                          height: `${CARD_SIZE}px`,
                          width: `${CARD_SIZE}px`,
                          backgroundColor: bgHexColor,
                          opacity: isFgDragging || isBgDragging ? 0.5 : 1,
                          cursor: showOverlayToggle ? "pointer" : undefined,
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
                        <div className={valueClassName} style={{ color: fgHexColor }}>
                          {valueDisplay}
                        </div>
                        <div className={badgeWrapperClass}>{badgeContent}</div>
                      </div>
                    )
                  })}
                </React.Fragment>
              )
            })}

            {isBottomAddRowVisible && (
              <div
                className="absolute flex items-center pr-0 mr-0 gap-2"
                style={{ left: 0, top: `${bottomAddRowTop}px`, width: `${ROW_LABEL_WIDTH}px`, height: `${CARD_SIZE}px` }}
              >
                <div className="flex gap-1 p-2 opacity-0 pointer-events-none">
                  <div className="h-8 w-0.5 rounded-full bg-foreground/40" />
                  <div className="h-8 w-0.5 rounded-full bg-foreground/40" />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-lg bg-transparent cursor-pointer border border-border hover:bg-foreground/5"
                  style={{ height: `${CARD_SIZE}px`, width: `${CARD_SIZE}px` }}
                  onClick={() => onAddColor?.()}
                >
                  <Plus className="h-8 w-8" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      {contrastOverlay && contrastOverlayPosition && (
        <ContrastOverlayPanel
          ref={contrastOverlayRef}
          position={contrastOverlayPosition}
          standard={contrastOverlay.standard}
          requirementLabel={contrastOverlay.requirementLabel}
          requirementId={contrastOverlay.requirementId}
          wcagEvaluation={contrastOverlay.wcagEvaluation}
          apcaEvaluation={contrastOverlay.apcaEvaluation}
          fgColor={contrastOverlay.fgColor}
          bgColor={contrastOverlay.bgColor}
          fgBaseIndex={contrastOverlay.fgBaseIndex}
          bgBaseIndex={contrastOverlay.bgBaseIndex}
          editingColorIndex={typeof editingColor?.index === "number" ? editingColor.index : null}
          onColorEdit={onColorEdit}
          onStandardChange={handleOverlayStandardChange}
          onRequirementChange={handleOverlayRequirementChange}
          closing={contrastOverlayClosing}
          expanded={contrastOverlayExpanded}
          onToggleExpand={() => setContrastOverlayExpanded((val) => !val)}
          onClose={closeContrastOverlay}
          contentRef={contrastOverlayContentRef}
        />
      )}

      <DropToTrash active={isAnyHeaderDragging} onDrop={handleDropOnTrash} variant="floating" />
    </div>
  )
}


type ContrastOverlayPanelProps = {
  position: { top: number; left: number; width: number; height: number }
  standard: ContrastStandard
  requirementLabel: string
  requirementId: ContrastRequirementId
  wcagEvaluation: WcagContrastEvaluation | null
  apcaEvaluation: ApcaContrastEvaluation | null
  fgColor: string
  bgColor: string
  fgBaseIndex?: number | null
  bgBaseIndex?: number | null
  editingColorIndex?: number | null
  onColorEdit?: (index: number) => void
  onStandardChange?: (standard: ContrastStandard) => void
  onRequirementChange?: (id: ContrastRequirementId) => void
  closing: boolean
  expanded: boolean
  onToggleExpand: () => void
  onClose: () => void
  contentRef?: React.RefObject<HTMLDivElement | null>
}

const ContrastOverlayPanel = React.forwardRef<HTMLDivElement, ContrastOverlayPanelProps>(function ContrastOverlayPanel(
  {
    position,
    standard,
    requirementLabel,
    requirementId,
    wcagEvaluation,
    apcaEvaluation,
    fgColor,
    bgColor,
    fgBaseIndex,
    bgBaseIndex,
    editingColorIndex,
    onColorEdit,
    onStandardChange,
    onRequirementChange,
    closing,
    expanded,
    onToggleExpand,
    onClose,
    contentRef,
  },
  ref,
) {
  const [animateIn, setAnimateIn] = useState(false)
  const [cardsExpanded, setCardsExpanded] = useState(false)

  useEffect(() => {
    setAnimateIn(true)
  }, [])

  useEffect(() => {
    if (!expanded) {
      setCardsExpanded(false)
      return
    }
    const frame = window.requestAnimationFrame(() => {
      setCardsExpanded(true)
    })
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [expanded])

  const isBrowser = typeof document !== "undefined"
  const showWcag = standard === "wcag2"
  const showApca = isApcaStandard(standard)

  const activeRequirement = useMemo(() => {
    return CONTRAST_REQUIREMENTS.find((requirement) => requirement.id === requirementId) ?? CONTRAST_REQUIREMENTS[0]
  }, [requirementId])

  const wcagRatio = wcagEvaluation?.ratio ?? null
  const apcaLc = apcaEvaluation?.lcAbs ?? null
  const apcaThresholds = getApcaThresholdsForStandard(standard, activeRequirement)
  const apcaMaxLc =
    standard === "apca-bronze" ? APCA_BRONZE_MAX_LC[activeRequirement.id] ?? null : null
  const apcaMarkers = useMemo(() => {
    if (!showApca) {
      return []
    }
    const markers = [{ value: apcaThresholds.min, label: formatLcThresholdLabel(apcaThresholds.min) }]
    if (typeof apcaThresholds.preferred === "number" && apcaThresholds.preferred !== apcaThresholds.min) {
      markers.push({ value: apcaThresholds.preferred, label: formatLcThresholdLabel(apcaThresholds.preferred) })
    }
    if (typeof apcaMaxLc === "number") {
      markers.push({ value: apcaMaxLc, label: formatLcThresholdLabel(apcaMaxLc) })
    }
    return markers
  }, [apcaMaxLc, apcaThresholds, showApca])
  const apcaIndicatorPosition = useMemo(() => {
    if (!showApca || apcaLc === null || Number.isNaN(apcaLc)) {
      return 50
    }
    return getApcaMarkerPosition(apcaLc)
  }, [apcaLc, showApca])
  const apcaGradient = useMemo(
    () =>
      getApcaGradient({
        min: apcaThresholds.min,
        preferred: apcaThresholds.preferred,
        max: typeof apcaMaxLc === "number" ? apcaMaxLc : undefined,
        tailGradient: standard === "apca-bronze" && activeRequirement.id === "non-text",
      }),
    [activeRequirement.id, apcaMaxLc, apcaThresholds.min, apcaThresholds.preferred, standard],
  )

  const orderedRequirements = useMemo(() => getOrderedRequirementsForStandard(standard), [standard])
  const overlayRequirementIndex = useMemo(() => {
    const index = orderedRequirements.findIndex((requirement) => requirement.id === requirementId)
    return index === -1 ? 0 : index
  }, [orderedRequirements, requirementId])

  const getOverlayRequirementShortLabel = useCallback(
    (requirement: ContrastRequirement) => {
      if (standard === "apca-bronze") {
        return getApcaBronzeLabel(requirement, "shortLabel")
      }
      if (isApcaStandard(standard)) {
        return requirement.apcaShortLabel ?? requirement.shortLabel
      }
      return requirement.shortLabel
    },
    [standard],
  )


  const requirementSections = useMemo(() => {
    return orderedRequirements.map((requirement) => {
      const apcaRequirement = getApcaRequirementForStandard(standard, requirement)
      const wcag = evaluateContrast("wcag2", fgColor, bgColor, requirement)
      const apca = evaluateContrast("apca", fgColor, bgColor, apcaRequirement)
      return {
        requirement,
        apcaThresholds: apcaRequirement.apcaThresholds,
        wcag: wcag?.standard === "wcag2" ? wcag : null,
        apca: apca?.standard === "apca" ? apca : null,
      }
    })
  }, [bgColor, fgColor, orderedRequirements, standard])

  const getSectionTitle = (requirement: ContrastRequirement) => {
    if (standard === "wcag2") {
      return requirement.label
    }
    if (standard === "apca-bronze") {
      return getApcaBronzeLabel(requirement, "label")
    }
    return requirement.apcaLabel ?? requirement.label
  }

  const sampleText = "The five boxing wizards jump quickly."

  const getStatusLabel = (value?: boolean) => {
    if (value === true) return "Pass"
    if (value === false) return "Fail"
    return "N/A"
  }

  const getStatusPillClass = (value?: boolean) => getStatusPillClassName(getStatusPillTone(value), "sm")

  const wcagIndicatorPosition = useMemo(() => {
    if (!showWcag || wcagRatio === null || Number.isNaN(wcagRatio)) {
      return 50
    }
    const ratio = Math.max(0, wcagRatio)
    let position = 50
    if (ratio <= 3) {
      position = (ratio / 3) * 25
    } else if (ratio <= 4.5) {
      position = 25 + ((ratio - 3) / 1.5) * 25
    } else if (ratio <= 7) {
      position = 50 + ((ratio - 4.5) / 2.5) * 25
    } else {
      const extra = Math.min((ratio - 7) / 7, 1)
      position = 75 + extra * 25
    }
    return clamp(position, SLIDER_EDGE_PADDING_PERCENT, 100 - SLIDER_EDGE_PADDING_PERCENT)
  }, [showWcag, wcagRatio])
  const wcagBarColors = useMemo(() => getWcagBarSegmentColors(activeRequirement), [activeRequirement])

  const canEditBg = typeof onColorEdit === "function" && typeof bgBaseIndex === "number"
  const canEditFg = typeof onColorEdit === "function" && typeof fgBaseIndex === "number"
  const editingIndex = typeof editingColorIndex === "number" ? editingColorIndex : null
  const isEditingBg = editingIndex !== null && editingIndex === bgBaseIndex
  const isEditingFg = editingIndex !== null && editingIndex === fgBaseIndex
  const [isRequirementFocusPanelOpen, setIsRequirementFocusPanelOpen] = useState(false)

  const handleBgCardClick = () => {
    if (typeof onColorEdit === "function" && typeof bgBaseIndex === "number") {
      onColorEdit(bgBaseIndex)
    }
  }

  const handleFgCardClick = () => {
    if (typeof onColorEdit === "function" && typeof fgBaseIndex === "number") {
      onColorEdit(fgBaseIndex)
    }
  }

  const handleBgExpandClick = () => {
    if (typeof onColorEdit === "function" && typeof bgBaseIndex === "number") {
      onColorEdit(bgBaseIndex)
    }
    onToggleExpand()
  }

  const handleFgExpandClick = () => {
    if (typeof onColorEdit === "function" && typeof fgBaseIndex === "number") {
      onColorEdit(fgBaseIndex)
    }
    onToggleExpand()
  }

  const displayRequirementLabel = requirementLabel
  const headerStandardLabel = standard === "wcag2" ? "WCAG" : "APCA Bronze"
  const overlayStandardLabel = STANDARD_LABELS[standard]


  const wcagPass = wcagEvaluation?.level.aa
  const apcaPass = apcaEvaluation?.meetsMinimum
  const statusFlag = isApcaStandard(standard) ? apcaPass : wcagPass
  const hasStatus = typeof statusFlag === "boolean"
  const isPass = statusFlag === true

  const statusLabel = hasStatus ? (isPass ? "PASS" : "FAIL") : "N/A"
  const statusClasses = getStatusPillClassName(getStatusPillTone(statusFlag), "md")

  const metricValue = isApcaStandard(standard)
    ? apcaLc !== null
      ? formatLcValue(apcaLc)
      : "--"
    : wcagRatio !== null
      ? wcagRatio.toFixed(2)
      : "--"

  const metricDisplay = isApcaStandard(standard) ? `Lc ${metricValue}` : metricValue

  const overlayContentWidth = Math.max(0, position.width - 64)
  const minCardRowWidth = CARD_SIZE * 2 + EXPANDED_CENTER_CARD_HEIGHT + GAP_SIZE * 2
  const shouldWrapCards = expanded && overlayContentWidth < minCardRowWidth

  const contrastCardStyle = {
    backgroundColor: bgColor,
    width: "100%",
    maxWidth: `${EXPANDED_CENTER_CARD_WIDTH}px`,
    minWidth: `${EXPANDED_CENTER_CARD_HEIGHT}px`,
    height: `${EXPANDED_CENTER_CARD_HEIGHT}px`,
  }

  const backgroundCard = (
    <div
      className={`relative transition-transform duration-300 ease-out ${
        cardsExpanded ? "translate-x-0 scale-100" : "translate-x-[45%] scale-95"
      } ${canEditBg ? "cursor-pointer hover:-translate-y-1" : "cursor-default opacity-80"}`}
    >
      {isEditingBg && <FocusIndicator />}
      <SwatchTile
        hexColor={bgColor}
        label={bgColor.toUpperCase()}
        labelPlacement="center"
        onClick={canEditBg ? handleBgCardClick : undefined}
        className={canEditBg ? "" : "cursor-default"}
      />
    </div>
  )

  const contrastCard = (
    <div className="relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-background shadow-lg" style={contrastCardStyle}>
      <div className="text-4xl font-semibold tracking-tight" style={{ color: fgColor }}>
        {metricDisplay}
      </div>
      <div className={statusClasses}>{statusLabel}</div>
    </div>
  )

  const foregroundCard = (
    <div
      className={`relative transition-transform duration-300 ease-out ${
        cardsExpanded ? "translate-x-0 scale-100" : "-translate-x-[45%] scale-95"
      } ${canEditFg ? "cursor-pointer hover:-translate-y-1" : "cursor-default opacity-80"}`}
    >
      {isEditingFg && <FocusIndicator />}
      <SwatchTile
        hexColor={fgColor}
        label={fgColor.toUpperCase()}
        labelPlacement="center"
        onClick={canEditFg ? handleFgCardClick : undefined}
        className={canEditFg ? "" : "cursor-default"}
      />
    </div>
  )

  const renderSample = (id: ContrastRequirementId) => {
    if (id === "non-text") {
      return (
        <div
          className="flex min-h-[6rem] w-full items-center justify-center rounded-lg border border-border/70 bg-background/70 p-4 text-center"
          style={{ backgroundColor: bgColor }}
        >
          <div className="flex w-full flex-wrap items-center justify-center gap-3">
            <div className="h-6 w-6 rounded-full border-2" style={{ borderColor: fgColor }} />
            <div
              className="flex max-w-full items-center rounded-md border-2 bg-background/90 px-3 py-1 text-center text-xs leading-snug break-words whitespace-normal"
              style={{ borderColor: fgColor, color: fgColor }}
            >
              Button label
            </div>
          </div>
        </div>
      )
    }

    const textClassName =
      id === "large-text"
        ? "text-[clamp(1rem,2.6vw,1.25rem)] font-semibold leading-snug"
        : "text-[clamp(0.85rem,2.2vw,1rem)] font-medium leading-snug"
    return (
      <div
        className="flex min-h-[6rem] w-full items-center justify-center rounded-lg border border-border/70 bg-background/70 p-4 text-center"
        style={{ backgroundColor: bgColor, color: fgColor }}
      >
        <span className={`${textClassName} break-words text-center`}>{sampleText}</span>
      </div>
    )
  }

  const messageText = useMemo(() => {
    if (showWcag) {
      if (wcagRatio === null || Number.isNaN(wcagRatio)) {
        return "WCAG contrast ratio is unavailable for this pair."
      }
      const ratioText = wcagRatio.toFixed(2)
      const aaTarget = activeRequirement.wcagThresholds.aa
      const aaaTarget = activeRequirement.wcagThresholds.aaa
      const requirementText = activeRequirement.label.toLowerCase()

      if (wcagRatio < aaTarget) {
        return `Contrast ratio ${ratioText}:1 is below WCAG AA (${formatThresholdLabel(aaTarget)}) for ${requirementText}.`
      }
      if (typeof aaaTarget === "number" && wcagRatio < aaaTarget) {
        return `Contrast ratio ${ratioText}:1 meets WCAG AA (${formatThresholdLabel(aaTarget)}) for ${requirementText}, but misses AAA (${formatThresholdLabel(aaaTarget)}).`
      }
      if (typeof aaaTarget === "number") {
        return `Contrast ratio ${ratioText}:1 meets WCAG AAA (${formatThresholdLabel(aaaTarget)}) for ${requirementText}.`
      }
      return `Contrast ratio ${ratioText}:1 meets WCAG AA (${formatThresholdLabel(aaTarget)}) for ${requirementText}.`
    }

    if (showApca && apcaEvaluation) {
      const lcText = formatLcValue(apcaEvaluation.lcAbs)
      const minTarget = apcaThresholds.min
      const preferredTarget = apcaThresholds.preferred
      const requirementText =
        standard === "apca-bronze"
          ? getApcaBronzeLabel(activeRequirement, "label").toLowerCase()
          : (activeRequirement.apcaLabel ?? activeRequirement.label).toLowerCase()
      const maxWarning =
        standard === "apca-bronze" &&
        typeof apcaMaxLc === "number" &&
        apcaEvaluation.lcAbs > apcaMaxLc
          ? ` Warning: Lc ${lcText} exceeds the bronze max (${formatLcThresholdLabel(apcaMaxLc)}) for large & bold text.`
          : ""
      if (apcaEvaluation.meetsPreferred && typeof preferredTarget === "number") {
        return `APCA Bronze Lc ${lcText} passes (preferred ${formatLcThresholdLabel(preferredTarget)}) for ${requirementText}.${maxWarning}`
      }
      if (apcaEvaluation.meetsMinimum) {
        return `APCA Bronze Lc ${lcText} passes (minimum ${formatLcThresholdLabel(minTarget)}) for ${requirementText}.${maxWarning}`
      }
      return `APCA Bronze Lc ${lcText} fails (minimum ${formatLcThresholdLabel(minTarget)}) for ${requirementText}.${maxWarning}`
    }

    return "Contrast data is unavailable for this pair."
  }, [activeRequirement, apcaEvaluation, apcaMaxLc, apcaThresholds, showApca, showWcag, standard, wcagRatio])

  if (!isBrowser) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div
        ref={ref}
        className={`pointer-events-auto transition-all duration-200 ease-out ${
          expanded
            ? "rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur-xl overflow-auto"
            : "rounded-[36px] border-2 border-black/80 bg-[#fdfbf7] shadow-[0_18px_45px_rgba(0,0,0,0.18)] overflow-hidden"
        } ${closing ? "opacity-0 scale-95" : animateIn ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
        style={{
          position: "fixed",
          top: `${position.top}px`,
          left: `${position.left}px`,
          width: `${position.width}px`,
          height: `${position.height}px`,
        }}
      >
        {expanded ? (
          <div className="relative h-full w-full overflow-hidden rounded-2xl">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-background/80 via-background/90 to-background/95" />
            <div ref={contentRef} className="relative flex w-full max-h-full flex-col gap-4 overflow-auto px-8 py-7">
              <div className="flex items-start justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setIsRequirementFocusPanelOpen((prev) => !prev)}
                  aria-expanded={isRequirementFocusPanelOpen}
                  className={`inline-flex max-w-full cursor-pointer flex-col border border-border px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    isRequirementFocusPanelOpen
                      ? "border-primary/60 bg-primary/5 text-primary shadow-sm"
                      : "bg-muted/20 text-foreground hover:border-primary/40"
                  }`}
                  style={{
                    borderRadius: isRequirementFocusPanelOpen ? CARD_CONTROL_RADII.elevated : CARD_CONTROL_RADII.pill,
                  }}
                >
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{headerStandardLabel}</p>
                      <p className="mt-2 text-2xl font-semibold leading-tight text-foreground">{displayRequirementLabel}</p>
                    </div>
                    <ChevronDown
                      className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                        isRequirementFocusPanelOpen ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleExpand}
                    aria-label={expanded ? "Collapse panel" : "Expand panel"}
                    className="h-12 w-12 rounded-full border border-border bg-background text-foreground hover:bg-foreground/5"
                  >
                    {expanded ? <Minus className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    aria-label="Close contrast details"
                    className="h-12 w-12 rounded-full border border-border bg-background text-foreground hover:bg-foreground/5"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {isRequirementFocusPanelOpen && (
                <div className="rounded-xl border border-border/60 bg-background/80 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requirement focus</p>
                    <div className={SEGMENTED_TOGGLE_CLASSNAMES.container}>
                      <button
                        type="button"
                        onClick={() => onStandardChange?.("wcag2")}
                        className={`${SEGMENTED_TOGGLE_CLASSNAMES.option} ${
                          standard === "wcag2"
                            ? SEGMENTED_TOGGLE_CLASSNAMES.optionActive
                            : SEGMENTED_TOGGLE_CLASSNAMES.optionInactive
                        }`}
                        aria-pressed={standard === "wcag2"}
                      >
                        WCAG
                      </button>
                      <button
                        type="button"
                        onClick={() => onStandardChange?.("apca-bronze")}
                        className={`${SEGMENTED_TOGGLE_CLASSNAMES.option} ${
                          standard === "apca-bronze"
                            ? SEGMENTED_TOGGLE_CLASSNAMES.optionActive
                            : SEGMENTED_TOGGLE_CLASSNAMES.optionInactive
                        }`}
                        aria-pressed={standard === "apca-bronze"}
                        aria-label="APCA Bronze"
                      >
                        APCA Bronze
                      </button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, orderedRequirements.length - 1)}
                      step={1}
                      value={overlayRequirementIndex}
                      aria-label={`Set ${overlayStandardLabel} requirement focus`}
                      aria-valuetext={`${displayRequirementLabel} requirement (${overlayStandardLabel})`}
                      onChange={(event) => {
                        const nextIndex = Number(event.currentTarget.value)
                        const nextRequirement = orderedRequirements[nextIndex]
                        if (nextRequirement) {
                          onRequirementChange?.(nextRequirement.id)
                        }
                      }}
                      className="w-full accent-foreground cursor-pointer transition-[transform,filter] duration-200 focus:brightness-110 active:brightness-125 active:scale-[1.01]"
                    />
                  </div>
                  <div className="mt-2 grid w-full grid-cols-3 gap-2 text-xs font-medium text-muted-foreground">
                    {orderedRequirements.map((option) => {
                      const isActive = option.id === requirementId
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onRequirementChange?.(option.id)}
                          className={`w-full rounded-full px-3 py-1 text-center leading-snug transition-all duration-150 ${
                            isActive ? "bg-foreground text-background shadow-sm" : "bg-transparent"
                          }`}
                        >
                          {getOverlayRequirementShortLabel(option)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {shouldWrapCards ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-2 text-sm font-medium text-muted-foreground">
                    <span className="text-center">Contrast</span>
                    {contrastCard}
                  </div>
                  <div className="flex flex-wrap items-start justify-center gap-4 text-sm font-medium text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-center">Background</span>
                      {backgroundCard}
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-center">Foreground</span>
                      {foregroundCard}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div
                    className="mx-auto grid w-fit items-end text-sm font-medium text-muted-foreground"
                    style={{
                      gridTemplateColumns: `${CARD_SIZE}px minmax(${EXPANDED_CENTER_CARD_HEIGHT}px, ${EXPANDED_CENTER_CARD_WIDTH}px) ${CARD_SIZE}px`,
                      columnGap: `${GAP_SIZE}px`,
                    }}
                  >
                    <span className="text-center">Background</span>
                    <span className="text-center">Contrast</span>
                    <span className="text-center">Foreground</span>
                  </div>
                  <div
                    className="mx-auto grid w-fit items-center"
                    style={{
                      gridTemplateColumns: `${CARD_SIZE}px minmax(${EXPANDED_CENTER_CARD_HEIGHT}px, ${EXPANDED_CENTER_CARD_WIDTH}px) ${CARD_SIZE}px`,
                      columnGap: `${GAP_SIZE}px`,
                    }}
                  >
                    {backgroundCard}
                    {contrastCard}
                    {foregroundCard}
                  </div>
                </div>
              )}

              <div className="relative w-full">
                <div className="w-full rounded-xl border border-border bg-background/80 px-5 py-4 text-sm text-foreground shadow-sm">
                  {messageText}
                </div>
                {(showWcag || showApca) && (
                  <BubbleIndicator left={showWcag ? wcagIndicatorPosition : apcaIndicatorPosition} />
                )}
              </div>

              {showWcag && (
                <div className="w-full">
                <div className="relative h-3 w-full">
                  <div className="absolute inset-0 flex overflow-hidden rounded-full border border-border shadow-sm">
                      <div className="flex-1" style={{ backgroundColor: wcagBarColors[0] }} />
                      <div className="flex-1" style={{ backgroundColor: wcagBarColors[1] }} />
                      <div className="flex-1" style={{ backgroundColor: wcagBarColors[2] }} />
                      <div className="flex-1" style={{ backgroundColor: wcagBarColors[3] }} />
                    </div>
                    <div className="absolute left-1/4 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background shadow-sm" />
                    <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background shadow-sm" />
                    <div className="absolute left-3/4 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background shadow-sm" />
                  </div>
                  <div className="relative mt-4 h-5 w-full text-base font-semibold text-foreground text-center">
                    <span className="absolute left-1/4 -translate-x-1/2 text-center">3:1</span>
                    <span className="absolute left-1/2 -translate-x-1/2 text-center">4.5:1</span>
                    <span className="absolute left-3/4 -translate-x-1/2 text-center">7:1</span>
                  </div>
                </div>
              )}
              {showApca && (
                <div className="w-full">
                  <ApcaRangeIndicator markers={apcaMarkers} gradient={apcaGradient} />
                </div>
              )}

              <div className="space-y-5">
                {requirementSections.map((section) => {
                  const isActive = section.requirement.id === requirementId
                  const apcaMaxValue =
                    standard === "apca-bronze" ? APCA_BRONZE_MAX_LC[section.requirement.id] : undefined
                  const apcaCategoryPass =
                    showApca && section.apca
                      ? section.apca.meetsMinimum && (typeof apcaMaxValue !== "number" || section.apca.lcAbs <= apcaMaxValue)
                      : undefined
                  return (
                    <div
                      key={section.requirement.id}
                      className={`rounded-xl border bg-background/80 p-4 shadow-sm ${
                        isActive ? "border-foreground/50" : "border-border/70"
                      }`}
                    >
                      <div className="flex flex-wrap items-start gap-4">
                        <div className="flex-[1_1_220px] min-w-[180px] max-w-full">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-base font-semibold leading-snug text-foreground break-words">
                              {getSectionTitle(section.requirement)}
                            </p>
                            {showApca && (
                              <span className={getStatusPillClass(apcaCategoryPass)}>
                                {getStatusLabel(apcaCategoryPass)}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground break-words">
                            {showWcag && (
                              <>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    WCAG AA ({formatThresholdLabel(section.requirement.wcagThresholds.aa)})
                                  </span>
                                  <span className={getStatusPillClass(section.wcag?.level.aa)}>
                                    {getStatusLabel(section.wcag?.level.aa)}
                                  </span>
                                </div>
                                {typeof section.requirement.wcagThresholds.aaa === "number" && (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      WCAG AAA ({formatThresholdLabel(section.requirement.wcagThresholds.aaa)})
                                    </span>
                                    <span className={getStatusPillClass(section.wcag?.level.aaa)}>
                                      {getStatusLabel(section.wcag?.level.aaa)}
                                    </span>
                                  </div>
                                )}
                              </>
                            )}
                            {showApca && (
                              <>
                                <>
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    APCA Bronze Minimum ({formatLcThresholdLabel(section.apcaThresholds.min)})
                                  </div>
                                  {typeof section.apcaThresholds.preferred === "number" && (
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      APCA Bronze Preferred ({formatLcThresholdLabel(section.apcaThresholds.preferred)})
                                    </div>
                                  )}
                                  {standard === "apca-bronze" && typeof APCA_BRONZE_MAX_LC[section.requirement.id] === "number" && (
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      APCA Bronze Max ({formatLcThresholdLabel(APCA_BRONZE_MAX_LC[section.requirement.id] as number)})
                                    </div>
                                  )}
                                </>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex-[1_1_260px] min-w-[200px] max-w-full">{renderSample(section.requirement.id)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="relative h-full w-full overflow-hidden rounded-[36px] px-8 py-7 text-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{headerStandardLabel}</p>
                <p className="mt-2 text-2xl font-semibold leading-tight text-black">{displayRequirementLabel}</p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleExpand}
                  aria-label={expanded ? "Collapse panel" : "Expand panel"}
                  className="h-12 w-12 rounded-full border-2 border-black/80 bg-white text-black hover:bg-black/5"
                >
                  {expanded ? <Minus className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  aria-label="Close contrast details"
                  className="h-12 w-12 rounded-full border-2 border-black/80 bg-white text-black hover:bg-black/5"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="mt-7 flex flex-col items-center gap-6">
              <div className="relative w-full max-w-[300px]">
                <button
                  type="button"
                  onClick={handleBgExpandClick}
                  aria-label="Expand contrast details"
                  className="absolute left-2 top-8 h-28 w-24 rounded-2xl border-2 border-black/80 cursor-pointer transition-transform hover:-translate-y-1"
                  style={{ backgroundColor: bgColor }}
                />
                <button
                  type="button"
                  onClick={handleFgExpandClick}
                  aria-label="Expand contrast details"
                  className="absolute right-2 top-8 h-28 w-24 rounded-2xl border-2 border-black/80 cursor-pointer transition-transform hover:-translate-y-1"
                  style={{ backgroundColor: fgColor }}
                />
                <div
                  className="relative mx-auto flex h-32 w-40 flex-col items-center justify-center gap-2 rounded-[28px] border-2 border-black/90 shadow-[0_10px_0_rgba(0,0,0,0.12)]"
                  style={{ backgroundColor: bgColor }}
                >
                  <div className="text-4xl font-semibold tracking-tight" style={{ color: fgColor }}>
                    {metricDisplay}
                  </div>
                  <div className={`rounded-full px-4 py-1 text-xs font-semibold ${statusClasses}`}>{statusLabel}</div>
                </div>
              </div>

              <div className="relative w-full max-w-[520px]">
                <div className="rounded-xl border border-border bg-background/80 px-5 py-4 text-center text-sm font-medium leading-relaxed">
                  {messageText}
                </div>
                {(showWcag || showApca) && (
                  <BubbleIndicator left={showWcag ? wcagIndicatorPosition : apcaIndicatorPosition} />
                )}
              </div>

              {showWcag && (
                <div className="w-full max-w-[520px]">
                <div className="relative h-3 w-full">
                <div className="absolute inset-0 flex overflow-hidden rounded-full border border-border shadow-sm">
                    <div className="flex-1" style={{ backgroundColor: wcagBarColors[0] }} />
                    <div className="flex-1" style={{ backgroundColor: wcagBarColors[1] }} />
                    <div className="flex-1" style={{ backgroundColor: wcagBarColors[2] }} />
                    <div className="flex-1" style={{ backgroundColor: wcagBarColors[3] }} />
                  </div>
                  <div className="absolute left-1/4 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background shadow-sm" />
                  <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background shadow-sm" />
                  <div className="absolute left-3/4 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background shadow-sm" />
                </div>
                <div className="relative mt-4 h-6 text-lg font-semibold">
                  <span className="absolute left-1/4 -translate-x-1/2">3:1</span>
                  <span className="absolute left-1/2 -translate-x-1/2">4.5:1</span>
                  <span className="absolute left-3/4 -translate-x-1/2">7:1</span>
                </div>
              </div>
            )}
              {showApca && (
                <div className="w-full max-w-[520px]">
                  <ApcaRangeIndicator markers={apcaMarkers} gradient={apcaGradient} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
})

