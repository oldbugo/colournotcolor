const STRC = 2.4
const NTX = 0.57
const RTX = 0.62
const NBG = 0.56
const RBG = 0.65
const BCLIP = 1.414
const BTHRSH = 0.022
const WSCALE = 1.14
const WOFFSET = 0.027
const WCLAMP = 0.1

const R_COEFF = 0.2126729
const G_COEFF = 0.7151522
const B_COEFF = 0.072175

type RGB = { r: number; g: number; b: number }

const parseHex = (hex: string): RGB | null => {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex
  if (normalized.length !== 6) {
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

const softClamp = (value: number): number => {
  if (value <= 0) {
    return 0
  }
  if (value < BTHRSH) {
    return value + Math.pow(BTHRSH - value, BCLIP)
  }
  return value
}

const srgbToYs = (hex: string): number | null => {
  const rgb = parseHex(hex)
  if (!rgb) {
    return null
  }

  const rLinear = Math.pow(rgb.r / 255, STRC)
  const gLinear = Math.pow(rgb.g / 255, STRC)
  const bLinear = Math.pow(rgb.b / 255, STRC)

  const ys = rLinear * R_COEFF + gLinear * G_COEFF + bLinear * B_COEFF
  return softClamp(ys)
}

export function calculateApca(textHex: string, backgroundHex: string): number | null {
  const textYs = srgbToYs(textHex)
  const backgroundYs = srgbToYs(backgroundHex)

  if (textYs === null || backgroundYs === null) {
    return null
  }

  if (textYs === backgroundYs) {
    return 0
  }

  const sapc =
    backgroundYs > textYs
      ? (Math.pow(backgroundYs, NBG) - Math.pow(textYs, NTX)) * WSCALE
      : (Math.pow(backgroundYs, RBG) - Math.pow(textYs, RTX)) * WSCALE

  if (Math.abs(sapc) < WCLAMP) {
    return 0
  }

  const adjusted = sapc > 0 ? sapc - WOFFSET : sapc + WOFFSET
  return adjusted * 100
}
