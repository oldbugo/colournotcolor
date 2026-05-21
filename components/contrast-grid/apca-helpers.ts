import {
  CONTRAST_REQUIREMENTS,
  type ApcaThresholds,
  type ContrastRequirement,
  type ContrastRequirementId,
  type ContrastStandard,
} from "@/lib/contrast-utils"
import type { ColorSwatch } from "@/types/palette"

/**
 * APCA Bronze content-type ordering for the contrast matrix's requirement selector.
 */
export const APCA_BRONZE_ORDER: ContrastRequirementId[] = ["large-text", "non-text", "normal-text"]

export const APCA_BRONZE_LABELS: Record<ContrastRequirementId, { label: string; shortLabel: string }> = {
  "large-text": { label: "Large fluent content", shortLabel: "Large fluent content" },
  "non-text": { label: "Other content text", shortLabel: "Other content text" },
  "normal-text": { label: "Body text", shortLabel: "Body text" },
}

export const APCA_BRONZE_DESCRIPTIONS: Partial<Record<ContrastRequirementId, string>> = {
  "non-text": "Fonts 16px or larger.",
  "large-text": "Fonts larger than 32px.",
}

export const APCA_BRONZE_THRESHOLDS: Record<ContrastRequirementId, ApcaThresholds> = {
  "normal-text": { min: 75, preferred: 90 },
  "non-text": { min: 60 },
  "large-text": { min: 45 },
}

export const APCA_BRONZE_MAX_LC: Partial<Record<ContrastRequirementId, number>> = {
  "large-text": 90,
}

/** Status colours used in the APCA range bar and WCAG bar visualisations. */
export const APCA_RANGE_COLORS = {
  fail: "#ff7a7a",
  caution: "#ffd36a",
  pass: "#7aa879",
}

export const APCA_RANGE_MAX = 108
export const APCA_RANGE_EDGE_PADDING_PERCENT = 2

const DIGITS_ONLY_PATTERN = /^\d+$/

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export const isApcaStandard = (standard: ContrastStandard) => standard === "apca-bronze"

/** Map an APCA Lc value to a 0–100% indicator position inside the range bar. */
export const getApcaMarkerPosition = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0
  }
  const clampedValue = Math.min(APCA_RANGE_MAX, Math.max(0, value))
  const percent = (clampedValue / APCA_RANGE_MAX) * 100
  return clamp(percent, APCA_RANGE_EDGE_PADDING_PERCENT, 100 - APCA_RANGE_EDGE_PADDING_PERCENT)
}

/** Like `getApcaMarkerPosition` but without edge padding — used for gradient stops. */
export const getApcaRangePercent = (value: number) => {
  const clampedValue = Math.min(APCA_RANGE_MAX, Math.max(0, value))
  return (clampedValue / APCA_RANGE_MAX) * 100
}

/** Build the linear-gradient string for the APCA range bar with the given thresholds. */
export const getApcaGradient = ({
  min,
  preferred,
  max,
  tailGradient,
}: {
  min: number
  preferred?: number
  max?: number
  tailGradient?: boolean
}) => {
  const minPct = getApcaRangePercent(min)
  const preferredPct = typeof preferred === "number" ? getApcaRangePercent(preferred) : null

  if (typeof max === "number") {
    const maxPct = getApcaRangePercent(max)
    const midPct = preferredPct !== null ? clamp(preferredPct, minPct, maxPct) : (minPct + maxPct) / 2
    return `linear-gradient(90deg, ${APCA_RANGE_COLORS.fail} 0%, ${APCA_RANGE_COLORS.fail} ${minPct}%, ${APCA_RANGE_COLORS.caution} ${minPct}%, ${APCA_RANGE_COLORS.pass} ${midPct}%, ${APCA_RANGE_COLORS.caution} ${maxPct}%, ${APCA_RANGE_COLORS.fail} ${maxPct}%, ${APCA_RANGE_COLORS.fail} 100%)`
  }

  if (preferredPct !== null) {
    return `linear-gradient(90deg, ${APCA_RANGE_COLORS.fail} 0%, ${APCA_RANGE_COLORS.fail} ${minPct}%, ${APCA_RANGE_COLORS.caution} ${minPct}%, ${APCA_RANGE_COLORS.pass} ${preferredPct}%, ${APCA_RANGE_COLORS.caution} 100%)`
  }

  if (tailGradient) {
    return `linear-gradient(90deg, ${APCA_RANGE_COLORS.fail} 0%, ${APCA_RANGE_COLORS.fail} ${minPct}%, ${APCA_RANGE_COLORS.caution} ${minPct}%, ${APCA_RANGE_COLORS.pass} 100%)`
  }

  return `linear-gradient(90deg, ${APCA_RANGE_COLORS.fail} 0%, ${APCA_RANGE_COLORS.fail} ${minPct}%, ${APCA_RANGE_COLORS.pass} ${minPct}%, ${APCA_RANGE_COLORS.pass} 100%)`
}

/** Status colours per WCAG ratio bucket [0..3), [3..4.5), [4.5..7), [7..]. */
export const getWcagBarSegmentColors = (requirement: ContrastRequirement) => {
  const aaTarget = requirement.wcagThresholds.aa
  const aaaTarget = requirement.wcagThresholds.aaa
  const segmentLowerBounds = [0, 3, 4.5, 7]
  return segmentLowerBounds.map((lower) => {
    if (typeof aaaTarget === "number" && lower >= aaaTarget) {
      return APCA_RANGE_COLORS.pass
    }
    if (lower >= aaTarget) {
      return APCA_RANGE_COLORS.caution
    }
    return APCA_RANGE_COLORS.fail
  })
}

export const getApcaBronzeLabel = (requirement: ContrastRequirement, variant: "label" | "shortLabel") => {
  const entry = APCA_BRONZE_LABELS[requirement.id]
  if (!entry) {
    return variant === "shortLabel"
      ? requirement.apcaShortLabel ?? requirement.shortLabel
      : requirement.apcaLabel ?? requirement.label
  }
  return variant === "shortLabel" ? entry.shortLabel : entry.label
}

export const getApcaBronzeDescription = (requirement: ContrastRequirement) =>
  APCA_BRONZE_DESCRIPTIONS[requirement.id] ?? requirement.apcaDescription ?? requirement.description

export const getApcaThresholdsForStandard = (standard: ContrastStandard, requirement: ContrastRequirement) => {
  if (standard === "apca-bronze") {
    return APCA_BRONZE_THRESHOLDS[requirement.id] ?? requirement.apcaThresholds
  }
  return requirement.apcaThresholds
}

export const getApcaRequirementForStandard = (standard: ContrastStandard, requirement: ContrastRequirement) => {
  const apcaThresholds = getApcaThresholdsForStandard(standard, requirement)
  if (apcaThresholds === requirement.apcaThresholds) {
    return requirement
  }
  return { ...requirement, apcaThresholds }
}

export const getRequirementLabelForStandard = (
  standard: ContrastStandard,
  requirement: ContrastRequirement,
) => {
  if (standard === "apca-bronze") {
    return getApcaBronzeLabel(requirement, "label")
  }
  return requirement.label
}

export const getOrderedRequirementsForStandard = (standard: ContrastStandard) => {
  if (standard !== "apca-bronze") {
    return CONTRAST_REQUIREMENTS
  }
  const requirementMap = new Map(CONTRAST_REQUIREMENTS.map((requirement) => [requirement.id, requirement]))
  return APCA_BRONZE_ORDER.map((id) => requirementMap.get(id)).filter(Boolean) as ContrastRequirement[]
}

export const formatThresholdLabel = (value: number) =>
  Number.isInteger(value) ? `${value.toFixed(0)}:1` : `${value.toFixed(1)}:1`

export const formatLcThresholdLabel = (value: number) => `Lc ${value}`

export const formatLcValue = (value: number) => {
  const rounded = Math.round(value * 10) / 10
  if (Object.is(rounded, -0)) {
    return "0"
  }
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)
}

/**
 * Pull a numeric ranking out of a colour swatch's name (preferred) or hex tail.
 *
 * Used by the contrast matrix's numeric filters so palettes whose swatch names
 * are tones like "100"/"200"/.../"900" can be filtered by range. Returns null
 * for plain hex-only swatches with a 6-digit numeric hex (i.e. avoids treating
 * `#123456` as the number 123456).
 */
export const extractNumericValue = (swatch: ColorSwatch): number | null => {
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
