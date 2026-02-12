const MAIN_TRC = 2.4
const NORM_BG = 0.56
const NORM_TXT = 0.57
const REV_TXT = 0.62
const REV_BG = 0.65
const BLK_THRS = 0.022
const BLK_CLMP = 1.414
const SCALE_BOW = 1.14
const SCALE_WOB = 1.14
const LOW_BOW_OFFSET = 0.027
const LOW_WOB_OFFSET = 0.027
const DELTA_Y_MIN = 0.0005
const LOW_CLIP = 0.1

const R_COEFF = 0.2126729
const G_COEFF = 0.7151522
const B_COEFF = 0.072175

type RGB = { r: number; g: number; b: number }

const normalizeHex = (hex: string): string | null => {
  const normalized = hex.trim().replace(/^#/, "")

  if (/^[\da-f]{3}$/i.test(normalized)) {
    return normalized
      .split("")
      .map((value) => value + value)
      .join("")
  }

  if (/^[\da-f]{6}$/i.test(normalized)) {
    return normalized
  }

  return null
}

const parseHex = (hex: string): RGB | null => {
  const normalized = normalizeHex(hex)
  if (!normalized) {
    return null
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)

  if ([r, g, b].some((value) => Number.isNaN(value))) {
    return null
  }

  return { r, g, b }
}

const srgbToY = ({ r, g, b }: RGB): number =>
  R_COEFF * Math.pow(r / 255, MAIN_TRC) + G_COEFF * Math.pow(g / 255, MAIN_TRC) + B_COEFF * Math.pow(b / 255, MAIN_TRC)

const softClampNearBlack = (value: number): number =>
  value > BLK_THRS ? value : value + Math.pow(BLK_THRS - value, BLK_CLMP)

export function calculateApca(textHex: string, backgroundHex: string): number | null {
  const textRgb = parseHex(textHex)
  const backgroundRgb = parseHex(backgroundHex)

  if (!textRgb || !backgroundRgb) {
    return null
  }

  const textY = softClampNearBlack(srgbToY(textRgb))
  const backgroundY = softClampNearBlack(srgbToY(backgroundRgb))

  if (Math.abs(backgroundY - textY) < DELTA_Y_MIN) {
    return 0
  }

  let sapc = 0
  let outputContrast = 0

  if (backgroundY > textY) {
    sapc = (Math.pow(backgroundY, NORM_BG) - Math.pow(textY, NORM_TXT)) * SCALE_BOW
    outputContrast = sapc < LOW_CLIP ? 0 : sapc - LOW_BOW_OFFSET
  } else {
    sapc = (Math.pow(backgroundY, REV_BG) - Math.pow(textY, REV_TXT)) * SCALE_WOB
    outputContrast = sapc > -LOW_CLIP ? 0 : sapc + LOW_WOB_OFFSET
  }

  return outputContrast * 100
}
