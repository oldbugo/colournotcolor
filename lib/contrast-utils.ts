import { calculateApca } from "@/lib/apca"

type RGB = { r: number; g: number; b: number }

const luminanceCache = new Map<string, number | null>()

function hexToRgb(hex: string): RGB | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: Number.parseInt(result[1], 16),
        g: Number.parseInt(result[2], 16),
        b: Number.parseInt(result[3], 16),
      }
    : null
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const val = c / 255
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function getCachedLuminance(color: string): number | null {
  const hex = extractHexFromColor(color).trim().toUpperCase()
  if (luminanceCache.has(hex)) {
    return luminanceCache.get(hex) ?? null
  }

  const rgb = hexToRgb(hex)
  const luminance = rgb ? getLuminance(rgb.r, rgb.g, rgb.b) : null
  luminanceCache.set(hex, luminance)
  return luminance
}

export function extractHexFromColor(color: string): string {
  const parts = color.split("#")
  if (parts.length > 1) {
    // Has custom name, return hex with #
    return "#" + parts[1]
  }
  // No custom name, ensure it starts with #
  return color.startsWith("#") ? color : "#" + color
}

export function extractCustomName(color: string): string {
  const parts = color.split("#")
  return parts.length > 1 ? parts[0] : ""
}

export type ContrastThresholds = {
  aa: number
  aaa?: number
}

export type ContrastStandard = "wcag2" | "apca-bronze"
export type ContrastCalculationStandard = "wcag2" | "apca"

export type ApcaThresholds = {
  min: number
  preferred?: number
}

export type ContrastRequirementId = "non-text" | "large-text" | "normal-text"

export type ApcaFontGuidanceRow = {
  sizeLabel: string
  minLc: number
  preferredLc: number
}

export type ApcaFontGuidance = {
  weightLabel: string
  description?: string
  rows: ApcaFontGuidanceRow[]
}

export type ContrastRequirement = {
  id: ContrastRequirementId
  label: string
  shortLabel: string
  description: string
  apcaLabel?: string
  apcaShortLabel?: string
  apcaDescription?: string
  wcagThresholds: ContrastThresholds
  apcaThresholds: ApcaThresholds
}

export type WcagLevel = {
  aa: boolean
  aaa: boolean
}

export type WcagContrastEvaluation = {
  standard: "wcag2"
  ratio: number
  level: WcagLevel
  thresholds: ContrastThresholds
}

export type ApcaContrastEvaluation = {
  standard: "apca"
  lc: number
  lcAbs: number
  thresholds: ApcaThresholds
  meetsMinimum: boolean
  meetsPreferred: boolean
}

export type ContrastEvaluation = WcagContrastEvaluation | ApcaContrastEvaluation

export function calculateContrast(color1: string, color2: string): number {
  const lum1 = getCachedLuminance(color1)
  const lum2 = getCachedLuminance(color2)

  if (lum1 === null || lum2 === null) return 1

  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)

  return (lighter + 0.05) / (darker + 0.05)
}

export function getWCAGLevel(
  ratio: number,
  thresholds: ContrastThresholds = { aa: 4.5, aaa: 7 },
): WcagLevel {
  const { aa, aaa } = thresholds

  return {
    aa: ratio >= aa,
    aaa: typeof aaa === "number" ? ratio >= aaa : false,
  }
}

export const CONTRAST_REQUIREMENTS: ContrastRequirement[] = [
  {
    id: "non-text",
    label: "Non-text contrast",
    shortLabel: "Non-text",
    description: "UI components, icons, and non-text elements.",
    apcaLabel: "UI & Iconography",
    apcaShortLabel: "UI",
    apcaDescription: "Interface chrome, pictograms, fine keylines, and incidental micro text.",
    wcagThresholds: { aa: 3 },
    apcaThresholds: { min: 30, preferred: 45 },
  },
  {
    id: "normal-text",
    label: "Normal text",
    shortLabel: "Body text",
    description: "Columns of body copy.",
    apcaLabel: "Body text (fluent)",
    apcaShortLabel: "Body",
    apcaDescription: "Paragraphs, multiline UI copy, and other fluent reading.",
    wcagThresholds: { aa: 4.5, aaa: 7 },
    apcaThresholds: { min: 75, preferred: 90 },
  },
  {
    id: "large-text",
    label: "Large text",
    shortLabel: "Large text",
    description: "Headlines and larger fluent content.",
    apcaLabel: "Large fluent",
    apcaShortLabel: "Fluent",
    apcaDescription: "Display sizes, hero copy, and other larger fluent content.",
    wcagThresholds: { aa: 3, aaa: 4.5 },
    apcaThresholds: { min: 60, preferred: 75 },
  },
]

export const APCA_FONT_GUIDANCE: Record<ContrastRequirementId, ApcaFontGuidance[]> = {
  "normal-text": [
    {
      weightLabel: "300–400 Regular",
      description: "Dense paragraph copy and multilingual UI strings.",
      rows: [
        { sizeLabel: "14–15 px", minLc: 95, preferredLc: 105 },
        { sizeLabel: "16–18 px", minLc: 90, preferredLc: 100 },
        { sizeLabel: "18–22 px", minLc: 85, preferredLc: 95 },
      ],
    },
    {
      weightLabel: "500–600 Semi/Bold",
      description: "Section headings and emphasized inline copy.",
      rows: [
        { sizeLabel: "16–18 px", minLc: 80, preferredLc: 90 },
        { sizeLabel: "18–22 px", minLc: 75, preferredLc: 85 },
        { sizeLabel: "22–26 px", minLc: 70, preferredLc: 80 },
      ],
    },
  ],
  "large-text": [
    {
      weightLabel: "400–500 Regular",
      description: "Hero lines and fluent display content.",
      rows: [
        { sizeLabel: "24–32 px", minLc: 70, preferredLc: 80 },
        { sizeLabel: "32–40 px", minLc: 65, preferredLc: 75 },
        { sizeLabel: "40+ px", minLc: 60, preferredLc: 70 },
      ],
    },
    {
      weightLabel: "600–700 Display",
      description: "Heavy headings and short callouts.",
      rows: [
        { sizeLabel: "24–32 px", minLc: 65, preferredLc: 75 },
        { sizeLabel: "32–40 px", minLc: 60, preferredLc: 70 },
        { sizeLabel: "40+ px", minLc: 55, preferredLc: 65 },
      ],
    },
  ],
  "non-text": [
    {
      weightLabel: "UI controls / icons",
      description: "Borders, glyphs, pictograms, and focus indicators.",
      rows: [
        { sizeLabel: "1–2 px keylines", minLc: 45, preferredLc: 60 },
        { sizeLabel: "16–24 px icons", minLc: 40, preferredLc: 55 },
        { sizeLabel: "24+ px pictograms", minLc: 35, preferredLc: 50 },
      ],
    },
    {
      weightLabel: "Incidental & micro text",
      description: "Status ticks, timestamp badges, and short labels.",
      rows: [
        { sizeLabel: "12–14 px, 400 weight", minLc: 45, preferredLc: 55 },
        { sizeLabel: "14–16 px, 600 weight", minLc: 40, preferredLc: 50 },
      ],
    },
  ],
}

export function evaluateContrast(
  standard: ContrastCalculationStandard,
  textColor: string,
  backgroundColor: string,
  requirement: ContrastRequirement,
): ContrastEvaluation | null {
  if (standard === "wcag2") {
    const ratio = calculateContrast(textColor, backgroundColor)
    const level = getWCAGLevel(ratio, requirement.wcagThresholds)
    return {
      standard: "wcag2",
      ratio,
      level,
      thresholds: requirement.wcagThresholds,
    }
  }

  const textHex = extractHexFromColor(textColor)
  const bgHex = extractHexFromColor(backgroundColor)
  const lc = calculateApca(textHex, bgHex)

  if (lc === null || Number.isNaN(lc)) {
    return null
  }

  const lcAbs = Math.abs(lc)
  const { min, preferred } = requirement.apcaThresholds
  const meetsPreferred = typeof preferred === "number" ? lcAbs >= preferred : false
  const meetsMinimum = lcAbs >= min

  return {
    standard: "apca",
    lc,
    lcAbs,
    thresholds: requirement.apcaThresholds,
    meetsMinimum,
    meetsPreferred,
  }
}
