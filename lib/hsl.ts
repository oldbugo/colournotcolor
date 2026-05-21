/**
 * Standard CSS HSL ↔ hex conversions used by the colour picker's HSL mode.
 *
 * These intentionally mirror the formula used by CSS `hsl()` rather than the
 * perceptually-uniform HSLuv space (which lives in lib/hsluv.ts).
 */

export type Hsl = { h: number; s: number; l: number }

export function hexToHSL(hex: string): Hsl {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return { h: 0, s: 0, l: 0 }

  const r = Number.parseInt(result[1], 16) / 255
  const g = Number.parseInt(result[2], 16) / 255
  const b = Number.parseInt(result[3], 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) {
    return { h: 0, s: 0, l: l * 100 }
  }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0)
      break
    case g:
      h = (b - r) / d + 2
      break
    default:
      h = (r - g) / d + 4
      break
  }

  return {
    h: (h / 6) * 360,
    s: s * 100,
    l: l * 100,
  }
}

export function hslToHex(h: number, s: number, l: number): string {
  const normalizedHue = ((h % 360) + 360) % 360
  const normalizedS = Math.max(0, Math.min(100, s)) / 100
  const normalizedL = Math.max(0, Math.min(100, l)) / 100

  const c = (1 - Math.abs(2 * normalizedL - 1)) * normalizedS
  const x = c * (1 - Math.abs(((normalizedHue / 60) % 2) - 1))
  const m = normalizedL - c / 2
  let r = 0
  let g = 0
  let b = 0

  if (normalizedHue < 60) {
    r = c
    g = x
  } else if (normalizedHue < 120) {
    r = x
    g = c
  } else if (normalizedHue < 180) {
    g = c
    b = x
  } else if (normalizedHue < 240) {
    g = x
    b = c
  } else if (normalizedHue < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }

  const toHex = (n: number) => {
    const channel = Math.round((n + m) * 255)
    const hex = channel.toString(16)
    return hex.length === 1 ? `0${hex}` : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
