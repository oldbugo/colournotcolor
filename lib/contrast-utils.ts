function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
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

export function calculateContrast(color1: string, color2: string): number {
  const hex1 = extractHexFromColor(color1)
  const hex2 = extractHexFromColor(color2)

  const rgb1 = hexToRgb(hex1)
  const rgb2 = hexToRgb(hex2)

  if (!rgb1 || !rgb2) return 1

  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b)
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b)

  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)

  return (lighter + 0.05) / (darker + 0.05)
}

export function getWCAGLevel(ratio: number): { aa: boolean; aaa: boolean } {
  return {
    aa: ratio >= 4.5,
    aaa: ratio >= 7,
  }
}
