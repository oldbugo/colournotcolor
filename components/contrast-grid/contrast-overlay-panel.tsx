"use client"

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Minus, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  CONTRAST_REQUIREMENTS,
  evaluateContrast,
  type ApcaContrastEvaluation,
  type ContrastRequirement,
  type ContrastRequirementId,
  type ContrastStandard,
  type WcagContrastEvaluation,
} from "@/lib/contrast-utils"
import { CARD_CONTROL_RADII, SEGMENTED_TOGGLE_CLASSNAMES } from "@/lib/design-tokens"
import { getStatusPillClassName, getStatusPillTone } from "@/lib/status-pill"

import {
  APCA_BRONZE_MAX_LC,
  formatLcThresholdLabel,
  formatLcValue,
  formatThresholdLabel,
  getApcaBronzeLabel,
  getApcaGradient,
  getApcaMarkerPosition,
  getApcaRequirementForStandard,
  getApcaThresholdsForStandard,
  getOrderedRequirementsForStandard,
  getWcagBarSegmentColors,
  isApcaStandard,
} from "./apca-helpers"
import { ApcaRangeIndicator, BubbleIndicator, FocusIndicator, SwatchTile } from "./visual-components"

const STANDARD_LABELS: Record<ContrastStandard, string> = {
  wcag2: "WCAG 2.x (ratio)",
  "apca-bronze": "APCA Bronze (Lc)",
}

const CARD_SIZE = 132
const GAP_SIZE = 16
const EXPANDED_CENTER_CARD_WIDTH = 288
const EXPANDED_CENTER_CARD_HEIGHT = 160
const SLIDER_EDGE_PADDING_PERCENT = 6

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export type ContrastOverlayPanelProps = {
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

export const ContrastOverlayPanel = React.forwardRef<HTMLDivElement, ContrastOverlayPanelProps>(
  function ContrastOverlayPanel(
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
  },
)
