import { describe, expect, it } from "vitest"

import {
  HSLUV_LIGHTNESS_EPSILON,
  HSLUV_PLANE_PADDING_PX,
  HSLUV_TEXTURE_SIZE,
  closestPoint,
  fromPixelCoordinate,
  getPickerGeometry,
  getPickerScale,
  mapHsluvSelectionToPlanePoint,
  mapPlanePointToHsluvSelection,
  normalizeHueInputDegrees,
  toPixelCoordinate,
} from "./hsluv-picker-geometry"

describe("getPickerGeometry", () => {
  it("returns an empty/degenerate geometry at L=0", () => {
    const geom = getPickerGeometry(0)
    expect(geom.vertices).toHaveLength(0)
    expect(geom.lines).toHaveLength(0)
    expect(geom.angles).toHaveLength(0)
    expect(geom.outerCircleRadius).toBe(0)
    expect(geom.innerCircleRadius).toBe(0)
  })

  it("returns an empty/degenerate geometry at L=100", () => {
    const geom = getPickerGeometry(100)
    expect(geom.vertices).toHaveLength(0)
    expect(geom.outerCircleRadius).toBe(0)
  })

  it("returns an ordered polygon for mid-lightness", () => {
    const geom = getPickerGeometry(50)
    // The HSLuv gamut polygon has a varying number of active edges depending
    // on L; at L=50 the implementation yields 4. The lib invariant is that
    // vertices, lines, and angles share the same length, and the radii are
    // ordered.
    expect(geom.vertices.length).toBeGreaterThanOrEqual(3)
    expect(geom.lines).toHaveLength(geom.vertices.length)
    expect(geom.angles).toHaveLength(geom.vertices.length)
    expect(geom.outerCircleRadius).toBeGreaterThan(0)
    expect(geom.innerCircleRadius).toBeGreaterThan(0)
    expect(geom.innerCircleRadius).toBeLessThan(geom.outerCircleRadius)
  })

  it("respects HSLUV_LIGHTNESS_EPSILON", () => {
    expect(HSLUV_LIGHTNESS_EPSILON).toBeGreaterThan(0)
    expect(HSLUV_LIGHTNESS_EPSILON).toBeLessThan(1e-6)
  })
})

describe("getPickerScale", () => {
  it("scales the outer radius to fit inside the padded square", () => {
    const geom = getPickerGeometry(50)
    const size = 400
    const scale = getPickerScale(geom, size, size)
    // The outer vertex should land within radius = size/2 - PADDING_PX.
    const limit = size / 2 - HSLUV_PLANE_PADDING_PX
    expect(geom.outerCircleRadius * scale).toBeCloseTo(limit, 6)
  })

  it("returns 1 when the geometry has zero outer radius", () => {
    const geom = getPickerGeometry(0)
    expect(getPickerScale(geom, 400, 400)).toBe(1)
  })
})

describe("toPixelCoordinate / fromPixelCoordinate", () => {
  it("forms a round-trip identity", () => {
    const width = 400
    const height = 400
    const scale = 0.5
    const source = { x: 12, y: -34 }
    const pixel = toPixelCoordinate(source, width, height, scale)
    const back = fromPixelCoordinate(pixel.x, pixel.y, width, height, scale)
    expect(back.x).toBeCloseTo(source.x, 9)
    expect(back.y).toBeCloseTo(source.y, 9)
  })

  it("maps the origin to the centre of the square", () => {
    const pixel = toPixelCoordinate({ x: 0, y: 0 }, 200, 200, 1)
    expect(pixel.x).toBe(100)
    expect(pixel.y).toBe(100)
  })

  it("flips the y-axis (positive y in Luv goes up; positive y in pixels goes down)", () => {
    const pixel = toPixelCoordinate({ x: 0, y: 10 }, 200, 200, 1)
    expect(pixel.y).toBeLessThan(100)
  })
})

describe("mapHsluvSelectionToPlanePoint", () => {
  it("returns a percent near (50, 50) for s=0 at mid-lightness", () => {
    const geom = getPickerGeometry(50)
    const scale = getPickerScale(geom, HSLUV_TEXTURE_SIZE, HSLUV_TEXTURE_SIZE)
    const { xPercent, yPercent } = mapHsluvSelectionToPlanePoint(
      0,
      0,
      50,
      geom,
      scale,
      HSLUV_TEXTURE_SIZE,
      HSLUV_TEXTURE_SIZE,
    )
    expect(xPercent).toBeCloseTo(50, 3)
    expect(yPercent).toBeCloseTo(50, 3)
  })

  it("returns (50, 50) for degenerate geometry", () => {
    const geom = getPickerGeometry(0)
    const scale = 1
    const result = mapHsluvSelectionToPlanePoint(0, 50, 0, geom, scale, 200, 200)
    expect(result).toEqual({ xPercent: 50, yPercent: 50 })
  })

  it("places saturated colours away from the centre", () => {
    const geom = getPickerGeometry(50)
    const scale = getPickerScale(geom, HSLUV_TEXTURE_SIZE, HSLUV_TEXTURE_SIZE)
    const result = mapHsluvSelectionToPlanePoint(
      0,
      100,
      50,
      geom,
      scale,
      HSLUV_TEXTURE_SIZE,
      HSLUV_TEXTURE_SIZE,
    )
    const dx = result.xPercent - 50
    const dy = result.yPercent - 50
    expect(Math.hypot(dx, dy)).toBeGreaterThan(5)
  })
})

describe("mapPlanePointToHsluvSelection", () => {
  it("at the centre, hue falls back to preservedHue and saturation is 0", () => {
    const geom = getPickerGeometry(50)
    const scale = getPickerScale(geom, HSLUV_TEXTURE_SIZE, HSLUV_TEXTURE_SIZE)
    const cx = HSLUV_TEXTURE_SIZE / 2
    const cy = HSLUV_TEXTURE_SIZE / 2
    const preserved = 137
    const { h, s } = mapPlanePointToHsluvSelection(
      cx,
      cy,
      HSLUV_TEXTURE_SIZE,
      HSLUV_TEXTURE_SIZE,
      50,
      geom,
      scale,
      preserved,
    )
    expect(s).toBeCloseTo(0, 3)
    expect(h).toBe(preserved)
  })

  it("returns (preservedHue, 0) for degenerate geometry", () => {
    const geom = getPickerGeometry(0)
    const result = mapPlanePointToHsluvSelection(50, 50, 200, 200, 0, geom, 1, 42)
    expect(result.s).toBe(0)
    expect(result.h).toBe(42)
  })

  it("approximately inverts mapHsluvSelectionToPlanePoint inside the gamut", () => {
    const geom = getPickerGeometry(50)
    const scale = getPickerScale(geom, HSLUV_TEXTURE_SIZE, HSLUV_TEXTURE_SIZE)
    const sourceH = 210
    const sourceS = 60
    const { xPercent, yPercent } = mapHsluvSelectionToPlanePoint(
      sourceH,
      sourceS,
      50,
      geom,
      scale,
      HSLUV_TEXTURE_SIZE,
      HSLUV_TEXTURE_SIZE,
    )
    const px = (xPercent / 100) * HSLUV_TEXTURE_SIZE
    const py = (yPercent / 100) * HSLUV_TEXTURE_SIZE
    const { h, s } = mapPlanePointToHsluvSelection(
      px,
      py,
      HSLUV_TEXTURE_SIZE,
      HSLUV_TEXTURE_SIZE,
      50,
      geom,
      scale,
      0,
    )
    expect(h).toBeCloseTo(sourceH, 1)
    expect(s).toBeCloseTo(sourceS, 1)
  })
})

describe("closestPoint", () => {
  it("returns the input point if it sits inside the inner circle", () => {
    const geom = getPickerGeometry(50)
    const inside = { x: 0.1, y: 0.1 }
    expect(closestPoint(geom, inside)).toEqual(inside)
  })

  it("clamps a point well outside the gamut onto the polygon", () => {
    const geom = getPickerGeometry(50)
    const farOut = { x: 1000, y: 0 }
    const clamped = closestPoint(geom, farOut)
    // The clamped point must be at-or-inside the outer circle radius.
    const radius = Math.hypot(clamped.x, clamped.y)
    expect(radius).toBeLessThanOrEqual(geom.outerCircleRadius + 1e-6)
  })
})

describe("normalizeHueInputDegrees", () => {
  it("wraps negative values into [0, 360]", () => {
    expect(normalizeHueInputDegrees(-30)).toBe(330)
  })

  it("returns 360 for any positive multiple of 360 (input UX quirk)", () => {
    expect(normalizeHueInputDegrees(360)).toBe(360)
    expect(normalizeHueInputDegrees(720)).toBe(360)
  })

  it("returns 0 for non-finite inputs", () => {
    expect(normalizeHueInputDegrees(Number.NaN)).toBe(0)
    expect(normalizeHueInputDegrees(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it("preserves values inside [0, 360)", () => {
    expect(normalizeHueInputDegrees(180)).toBe(180)
    expect(normalizeHueInputDegrees(0)).toBe(0)
  })
})
