"use client"

/* eslint-disable react-hooks/set-state-in-effect */

import React from "react"
import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from "react"
import { ChevronDown, Plus, Settings, Shuffle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { getStatusPillBaseClassName, getStatusPillClassName } from "@/lib/status-pill"
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
  getApcaRequirementForStandard,
  getApcaThresholdsForStandard,
  getOrderedRequirementsForStandard,
  getRequirementLabelForStandard,
  isApcaStandard,
} from "@/components/contrast-grid/apca-helpers"
import {
  FILTER_STEP_MAX_INDEX,
  FILTER_STEP_VALUES,
  useContrastFilters,
} from "@/components/contrast-grid/use-contrast-filters"
import { ContrastGridStyles } from "@/components/contrast-grid/contrast-grid-styles"
import { ContrastOverlayPanel } from "@/components/contrast-grid/contrast-overlay-panel"
import {
  FilterMenuColorGroups,
  FilterMenuNumberSection,
} from "@/components/contrast-grid/filter-menu-content"
import { useGridPan } from "@/components/contrast-grid/use-grid-pan"
import { useHeaderDnd } from "@/components/contrast-grid/use-header-dnd"
import {
  ConfirmActionButton,
  FocusIndicator,
  ResizeCornerHandle,
  SwatchTile,
} from "@/components/contrast-grid/visual-components"

const CARD_SIZE = 132 // px
const GAP_SIZE = 16 // px (gap-4)
const ANIMATION_DURATION = 0.25 // seconds - faster animation
const CARD_WITH_GAP = CARD_SIZE + GAP_SIZE // 148px
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

  const {
    draggedFgIndex,
    draggedBgIndex,
    fgDragMode,
    bgDragMode,
    fgIndicatorPosition,
    bgIndicatorPosition,
    fgSwapHighlightStyle,
    bgSwapHighlightStyle,
    isAnyHeaderDragging,
    handleFgDragStart,
    handleFgDragOver,
    handleFgDrop,
    handleFgDragEnd,
    handleBgDragStart,
    handleBgDragOver,
    handleBgGapDragOver,
    handleBgDrop,
    handleBgDragEnd,
    handleDropOnTrash,
    handleFgHeaderClick,
    handleBgHeaderClick,
    handleFgHandleKeyDown,
    handleBgHandleKeyDown,
    handleCellFgDragOver,
    handleCellBgDragOver,
    handleGridDragOver,
    getFgAnimationStyle,
    getBgAnimationStyle,
    getCellAnimationStyle,
  } = useHeaderDnd({
    foregroundBaseIndexes,
    backgroundBaseIndexes,
    foregroundColumnCount: foregroundColors.length,
    backgroundRowCount: backgroundColors.length,
    colorsLength: colors.length,
    gridRef,
    fgHeaderRefs,
    bgLabelRefs,
    geometry: {
      cardWithGap: CARD_WITH_GAP,
      gapSize: GAP_SIZE,
      animationDuration: ANIMATION_DURATION,
      rowLabelWidth: ROW_LABEL_WIDTH,
    },
    onSwapColors,
    onReorderColors,
    onColorEdit,
    onRemoveColor,
  })

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
      <ContrastGridStyles cardWithGap={CARD_WITH_GAP} />

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
                <FilterMenuNumberSection
                  label="Range Filter"
                  filter={rowNumberFilter}
                  setFilter={setRowNumberFilter}
                  inputValues={rowNumberInputs}
                  setInputValues={setRowNumberInputs}
                  expanded={isRowRangeExpanded}
                  onToggleExpanded={() => setIsRowRangeExpanded((prev) => !prev)}
                  numericBounds={numericBounds}
                  clampRangeToBounds={clampRangeToBounds}
                  numberFilterStep={numberFilterStep}
                  focusedNumberInput={focusedNumberInput}
                  setFocusedNumberInput={setFocusedNumberInput}
                />
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
                <FilterMenuColorGroups
                  groups={groupedColorEntries}
                  effectiveSet={effectiveRowFilterIds}
                  toggleSingle={toggleRowFilterValue}
                  toggleGroup={toggleRowGroupValue}
                  collapsedSet={collapsedGroupKeys}
                  onToggleCollapse={toggleGroupCollapse}
                  numberFilter={rowNumberFilter}
                  passesNumberFilter={passesNumberFilter}
                />
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
                <FilterMenuNumberSection
                  label="Range Filter"
                  filter={columnNumberFilter}
                  setFilter={setColumnNumberFilter}
                  inputValues={columnNumberInputs}
                  setInputValues={setColumnNumberInputs}
                  expanded={isColumnRangeExpanded}
                  onToggleExpanded={() => setIsColumnRangeExpanded((prev) => !prev)}
                  numericBounds={numericBounds}
                  clampRangeToBounds={clampRangeToBounds}
                  numberFilterStep={numberFilterStep}
                  focusedNumberInput={focusedNumberInput}
                  setFocusedNumberInput={setFocusedNumberInput}
                />
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
                <FilterMenuColorGroups
                  groups={groupedColorEntries}
                  effectiveSet={effectiveColumnFilterIds}
                  toggleSingle={toggleColumnFilterValue}
                  toggleGroup={toggleColumnGroupValue}
                  collapsedSet={collapsedGroupKeys}
                  onToggleCollapse={toggleGroupCollapse}
                  numberFilter={columnNumberFilter}
                  passesNumberFilter={passesNumberFilter}
                />
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
                    role="columnheader"
                    aria-label={`Foreground column ${i + 1}: ${displayText}`}
                    aria-grabbed={isDragging || undefined}
                    onDragOver={(e) => handleFgDragOver(e, i)}
                    onDrop={handleFgDrop}
                    data-color-card
                  >
                    {isEditing && <FocusIndicator />}

                    <DragHandle
                      draggable
                      data-drag-handle
                      role="button"
                      tabIndex={0}
                      aria-label={`Drag foreground ${displayText} to reorder. Use arrow left or right to swap with the adjacent column.`}
                      className="mb-1"
                      highlighted={hoveredFgIndex === i}
                      onDragStart={(event) => handleFgDragStart(event, i)}
                      onDragEnd={handleFgDragEnd}
                      onMouseEnter={() => setHoveredFgIndex(i)}
                      onMouseLeave={() => setHoveredFgIndex(null)}
                      onKeyDown={(event) => {
                        if (handleFgHandleKeyDown(i, event)) {
                          event.preventDefault()
                        }
                      }}
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
                    role="rowheader"
                    aria-label={`Background row ${bgIndex + 1}: ${bgDisplayText}`}
                    aria-grabbed={isBgDragging || undefined}
                    onDragOver={(e) => handleBgDragOver(e, bgIndex)}
                    onDrop={handleBgDrop}
                    data-color-card
                  >
                    {isEditing && <FocusIndicator />}

                    <DragHandle
                      draggable
                      data-drag-handle
                      orientation="vertical"
                      role="button"
                      tabIndex={0}
                      aria-label={`Drag background ${bgDisplayText} to reorder. Use arrow up or down to swap with the adjacent row.`}
                      className="px-1 py-2 shrink-0"
                      highlighted={hoveredBgIndex === bgIndex}
                      onDragStart={(event) => handleBgDragStart(event, bgIndex)}
                      onDragEnd={handleBgDragEnd}
                      onMouseEnter={() => setHoveredBgIndex(bgIndex)}
                      onMouseLeave={() => setHoveredBgIndex(null)}
                      onKeyDown={(event) => {
                        if (handleBgHandleKeyDown(bgIndex, event)) {
                          event.preventDefault()
                        }
                      }}
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


