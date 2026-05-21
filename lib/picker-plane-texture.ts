import { luvToHex, type Hsluv } from "@/lib/hsluv"
import {
  HSLUV_TEXTURE_BLOCK_SIZE,
  closestPoint,
  fromPixelCoordinate,
  getPickerScale,
  toPixelCoordinate,
  type PickerGeometry,
} from "@/lib/hsluv-picker-geometry"

/**
 * Pure 2-D canvas drawing helpers for the HSL/HSLuv colour picker plane.
 * These exist so the canvas drawing effect inside PaletteManager has a
 * narrow, side-effect-free surface to call into.
 */

/**
 * Paint the plain CSS-HSL gradient (saturation across, lightness down)
 * for a given hue. Used in HSL mode where the gamut is rectangular.
 */
export function drawHslPlaneTexture(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hue: number,
) {
  const normalizedHue = ((hue % 360) + 360) % 360
  const rowCount = Math.max(1, Math.round(height))
  for (let y = 0; y < rowCount; y += 1) {
    const ratioY = rowCount === 1 ? 0 : y / (rowCount - 1)
    const lightness = (1 - ratioY) * 100
    const rowGradient = ctx.createLinearGradient(0, y, width, y)
    rowGradient.addColorStop(0, `hsl(${normalizedHue}, 0%, ${lightness}%)`)
    rowGradient.addColorStop(1, `hsl(${normalizedHue}, 100%, ${lightness}%)`)
    ctx.fillStyle = rowGradient
    ctx.fillRect(0, y, width, 1)
  }
}

/**
 * Build the HSLuv plane texture as an offscreen canvas. The plane is
 * walked in HSLUV_TEXTURE_BLOCK_SIZE blocks; each block's centre is
 * projected back into Luv coordinates, clamped to the visible gamut
 * polygon, and converted to a hex colour for the fill.
 *
 * Returns null when:
 *   - the global `document` is not available (SSR),
 *   - the canvas 2D context cannot be acquired,
 *   - the requested mode/plane combination is not supported,
 *   - lightness is at the gamut extremes (0 or 100),
 *   - the geometry has no visible vertices.
 */
export function generatePlaneTexture(
  mode: "hsl" | "hsluv",
  plane: "h" | "s" | "l",
  base: Hsluv,
  geometry: PickerGeometry,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") {
    return null
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return null
  }

  if (mode !== "hsluv" || plane !== "l") {
    return null
  }

  if (base.l <= 0.00000001 || base.l >= 99.9999999 || geometry.vertices.length === 0) {
    return null
  }

  const scale = getPickerScale(geometry, width, height)
  const shapePoints = geometry.vertices.map((point) => toPixelCoordinate(point, width, height, scale))
  const xs = shapePoints.map((point) => point.x)
  const ys = shapePoints.map((point) => point.y)
  const xmin = Math.floor(Math.min(...xs) / HSLUV_TEXTURE_BLOCK_SIZE)
  const ymin = Math.floor(Math.min(...ys) / HSLUV_TEXTURE_BLOCK_SIZE)
  const xmax = Math.ceil(Math.max(...xs) / HSLUV_TEXTURE_BLOCK_SIZE)
  const ymax = Math.ceil(Math.max(...ys) / HSLUV_TEXTURE_BLOCK_SIZE)

  ctx.clearRect(0, 0, width, height)
  ctx.globalCompositeOperation = "source-over"

  for (let blockX = xmin; blockX < xmax; blockX += 1) {
    for (let blockY = ymin; blockY < ymax; blockY += 1) {
      const px = blockX * HSLUV_TEXTURE_BLOCK_SIZE
      const py = blockY * HSLUV_TEXTURE_BLOCK_SIZE
      const point = fromPixelCoordinate(
        px + HSLUV_TEXTURE_BLOCK_SIZE / 2,
        py + HSLUV_TEXTURE_BLOCK_SIZE / 2,
        width,
        height,
        scale,
      )
      const clamped = closestPoint(geometry, point)
      const hex = luvToHex(base.l, clamped.x, clamped.y)
      ctx.fillStyle = hex
      ctx.fillRect(px, py, HSLUV_TEXTURE_BLOCK_SIZE, HSLUV_TEXTURE_BLOCK_SIZE)
    }
  }

  ctx.globalCompositeOperation = "destination-in"
  ctx.beginPath()
  ctx.moveTo(shapePoints[0].x, shapePoints[0].y)
  for (let i = 1; i < shapePoints.length; i += 1) {
    ctx.lineTo(shapePoints[i].x, shapePoints[i].y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.globalCompositeOperation = "source-over"

  return canvas
}
