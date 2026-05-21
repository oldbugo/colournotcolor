import {
  getHsluvBoundingLines,
  luvToHsluv,
  maxChromaForHsluv,
  type HsluvBoundingLine,
} from "@/lib/hsluv"

/**
 * Pure geometry helpers backing the HSLuv 2-D colour picker plane.
 *
 * All math in this module is React-free and operates on a normalised
 * Luv (u, v) plane centred at the origin. The picker renders this plane
 * inside a square canvas and converts back and forth between Luv coordinates
 * and pixel coordinates via the `toPixelCoordinate` / `fromPixelCoordinate`
 * helpers.
 */

export type PlanePoint = {
  x: number
  y: number
}

type PickerGeometryIntersection = {
  line1: number
  line2: number
  intersectionPoint: PlanePoint
  relativeAngle: number
}

export type PickerGeometry = {
  lines: HsluvBoundingLine[]
  vertices: PlanePoint[]
  angles: number[]
  outerCircleRadius: number
  innerCircleRadius: number
}

export const HSLUV_PLANE_PADDING_PX = 8
export const HSLUV_TEXTURE_SIZE = 400
export const HSLUV_TEXTURE_BLOCK_SIZE = 8
export const HSLUV_LIGHTNESS_EPSILON = 0.00000001

const normalizeHueDegrees = (value: number): number => {
  const wrapped = value % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

export function normalizeHueInputDegrees(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  const wrapped = value % 360
  const normalized = wrapped < 0 ? wrapped + 360 : wrapped
  if (Math.abs(normalized) < 0.0000001 && value > 0) {
    return 360
  }
  return normalized
}

const normalizeAngleRadians = (angle: number): number => {
  const fullRotation = 2 * Math.PI
  return ((angle % fullRotation) + fullRotation) % fullRotation
}

const intersectLineLine = (a: HsluvBoundingLine, b: HsluvBoundingLine): PlanePoint => {
  const x = (a.intercept - b.intercept) / (b.slope - a.slope)
  const y = a.slope * x + a.intercept
  return { x, y }
}

const distanceFromOrigin = (point: PlanePoint): number =>
  Math.sqrt(point.x * point.x + point.y * point.y)

const distanceLineFromOrigin = (line: HsluvBoundingLine): number =>
  Math.abs(line.intercept) / Math.sqrt(line.slope * line.slope + 1)

const angleFromOrigin = (point: PlanePoint): number => Math.atan2(point.y, point.x)

const perpendicularThroughPoint = (
  line: HsluvBoundingLine,
  point: PlanePoint,
): HsluvBoundingLine => {
  const slope = -1 / line.slope
  const intercept = point.y - slope * point.x
  return { slope, intercept }
}

const lengthOfRayUntilIntersect = (theta: number, line: HsluvBoundingLine): number =>
  line.intercept / (Math.sin(theta) - line.slope * Math.cos(theta))

export function getPickerGeometry(lightness: number): PickerGeometry {
  if (lightness <= 0.00000001 || lightness >= 99.9999999) {
    return {
      lines: [],
      vertices: [],
      angles: [],
      outerCircleRadius: 0,
      innerCircleRadius: 0,
    }
  }

  const lines = getHsluvBoundingLines(lightness)
  let closestIndex = 0
  let closestLineDistance: number | null = null
  for (let i = 0; i < lines.length; i += 1) {
    const distance = distanceLineFromOrigin(lines[i])
    if (closestLineDistance === null || distance < closestLineDistance) {
      closestLineDistance = distance
      closestIndex = i
    }
  }

  const closestLine = lines[closestIndex]
  const perpendicularLine: HsluvBoundingLine = { slope: -1 / closestLine.slope, intercept: 0 }
  const startingAngle = angleFromOrigin(intersectLineLine(closestLine, perpendicularLine))

  const intersections: PickerGeometryIntersection[] = []
  for (let i1 = 0; i1 < lines.length - 1; i1 += 1) {
    for (let i2 = i1 + 1; i2 < lines.length; i2 += 1) {
      const point = intersectLineLine(lines[i1], lines[i2])
      const angle = angleFromOrigin(point)
      intersections.push({
        line1: i1,
        line2: i2,
        intersectionPoint: point,
        relativeAngle: normalizeAngleRadians(angle - startingAngle),
      })
    }
  }

  intersections.sort((a, b) => a.relativeAngle - b.relativeAngle)

  const orderedLines: HsluvBoundingLine[] = []
  const orderedVertices: PlanePoint[] = []
  const orderedAngles: number[] = []
  let outerCircleRadius = 0
  let currentIndex = closestIndex
  for (let i = 0; i < intersections.length; i += 1) {
    const intersection = intersections[i]
    let nextIndex: number | null = null
    if (intersection.line1 === currentIndex) {
      nextIndex = intersection.line2
    } else if (intersection.line2 === currentIndex) {
      nextIndex = intersection.line1
    }
    if (nextIndex !== null) {
      currentIndex = nextIndex
      orderedLines.push(lines[nextIndex])
      orderedVertices.push(intersection.intersectionPoint)
      orderedAngles.push(angleFromOrigin(intersection.intersectionPoint))
      outerCircleRadius = Math.max(outerCircleRadius, distanceFromOrigin(intersection.intersectionPoint))
    }
  }

  return {
    lines: orderedLines,
    vertices: orderedVertices,
    angles: orderedAngles,
    outerCircleRadius,
    innerCircleRadius: closestLineDistance ?? 0,
  }
}

export function getPickerScale(geometry: PickerGeometry, width: number, height: number): number {
  const radiusPixels = Math.max(1, Math.min(width, height) / 2 - HSLUV_PLANE_PADDING_PX)
  if (geometry.outerCircleRadius <= 0) {
    return 1
  }
  return radiusPixels / geometry.outerCircleRadius
}

export function mapHsluvSelectionToPlanePoint(
  hue: number,
  saturation: number,
  lightness: number,
  geometry: PickerGeometry,
  scale: number,
  width: number,
  height: number,
): { xPercent: number; yPercent: number } {
  if (geometry.vertices.length === 0 || geometry.outerCircleRadius <= 0) {
    return { xPercent: 50, yPercent: 50 }
  }

  const chromaLimit = maxChromaForHsluv(hue, lightness)
  const chroma = chromaLimit <= 0 ? 0 : (Math.max(0, Math.min(100, saturation)) / 100) * chromaLimit
  const hrad = (normalizeHueDegrees(hue) / 360) * 2 * Math.PI
  const point = toPixelCoordinate(
    { x: chroma * Math.cos(hrad), y: chroma * Math.sin(hrad) },
    width,
    height,
    scale,
  )

  const xPercent = (point.x / width) * 100
  const yPercent = (point.y / height) * 100
  return {
    xPercent: Math.max(0, Math.min(100, xPercent)),
    yPercent: Math.max(0, Math.min(100, yPercent)),
  }
}

export function mapPlanePointToHsluvSelection(
  x: number,
  y: number,
  width: number,
  height: number,
  lightness: number,
  geometry: PickerGeometry,
  scale: number,
  preservedHue: number,
): { h: number; s: number } {
  if (geometry.vertices.length === 0) {
    return { h: normalizeHueDegrees(preservedHue), s: 0 }
  }

  const pointer = fromPixelCoordinate(x, y, width, height, scale)
  const clampedPoint = closestPoint(geometry, pointer)
  const [computedHue, computedSaturation] = luvToHsluv(lightness, clampedPoint.x, clampedPoint.y)
  const saturation = Math.max(0, Math.min(100, computedSaturation))
  const hue = saturation <= 0.0001 ? normalizeHueDegrees(preservedHue) : normalizeHueDegrees(computedHue)

  return { h: hue, s: saturation }
}

export function closestPoint(geometry: PickerGeometry, point: PlanePoint): PlanePoint {
  const angle = angleFromOrigin(point)
  let smallestRelativeAngle = Math.PI * 2
  let index1 = 0
  for (let i = 0; i < geometry.vertices.length; i += 1) {
    const relativeAngle = normalizeAngleRadians(geometry.angles[i] - angle)
    if (relativeAngle < smallestRelativeAngle) {
      smallestRelativeAngle = relativeAngle
      index1 = i
    }
  }
  const index2 = (index1 - 1 + geometry.vertices.length) % geometry.vertices.length
  const closestLine = geometry.lines[index2]
  if (distanceFromOrigin(point) < lengthOfRayUntilIntersect(angle, closestLine)) {
    return point
  }

  const perpendicularLine = perpendicularThroughPoint(closestLine, point)
  const intersectionPoint = intersectLineLine(closestLine, perpendicularLine)
  const bound1 = geometry.vertices[index1]
  const bound2 = geometry.vertices[index2]
  const upperBound = bound1.x > bound2.x ? bound1 : bound2
  const lowerBound = bound1.x > bound2.x ? bound2 : bound1

  if (intersectionPoint.x > upperBound.x) {
    return upperBound
  }
  if (intersectionPoint.x < lowerBound.x) {
    return lowerBound
  }
  return intersectionPoint
}

export function toPixelCoordinate(
  point: PlanePoint,
  width: number,
  height: number,
  scale: number,
): PlanePoint {
  return {
    x: point.x * scale + width / 2,
    y: height / 2 - point.y * scale,
  }
}

export function fromPixelCoordinate(
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
): PlanePoint {
  return {
    x: (x - width / 2) / scale,
    y: (height / 2 - y) / scale,
  }
}
