import { describe, expect, it } from "vitest"

import {
  computeHorizontalIndicatorPosition,
  computeVerticalIndicatorPosition,
} from "./dnd-indicators"

const containerRect = { left: 0, right: 400, top: 0, bottom: 200, width: 400, height: 200 }
const cardRect = { left: 100, right: 200, top: 30, bottom: 130, width: 100, height: 100 }

describe("computeVerticalIndicatorPosition", () => {
  it("places the indicator to the left of the target for 'before'", () => {
    const result = computeVerticalIndicatorPosition({
      containerRect,
      targetRect: cardRect,
      position: "before",
      gap: 16,
    })
    // gap=16 ⇒ axisOffset = gap/2 = 8 ⇒ left = 100 - 8 = 92.
    expect(result.left).toBe(92)
  })

  it("places the indicator to the right of the target for 'after'", () => {
    const result = computeVerticalIndicatorPosition({
      containerRect,
      targetRect: cardRect,
      position: "after",
      gap: 16,
    })
    // axisOffset = 8 ⇒ left = 200 + 8 = 208.
    expect(result.left).toBe(208)
  })

  it("falls back to a 6px offset when gap is omitted", () => {
    const before = computeVerticalIndicatorPosition({
      containerRect,
      targetRect: cardRect,
      position: "before",
    })
    expect(before.left).toBe(100 - 6)
  })

  it("uses the given lengthStrategy on the target height", () => {
    const result = computeVerticalIndicatorPosition({
      containerRect,
      targetRect: cardRect,
      position: "before",
      lengthStrategy: (h) => Math.max(h - 20, h * 0.5),
    })
    expect(result.height).toBe(80)
  })

  it("clamps the indicator inside the container width", () => {
    // Target sits at the very left edge — the "before" indicator would land at -8
    // but should clamp to clampInset (default 1.5).
    const edgeRect = { left: 0, right: 80, top: 0, bottom: 80, width: 80, height: 80 }
    const result = computeVerticalIndicatorPosition({
      containerRect,
      targetRect: edgeRect,
      position: "before",
      gap: 16,
    })
    expect(result.left).toBe(1.5)
  })

  it("applies crossOffset on top when align is 'center'", () => {
    const result = computeVerticalIndicatorPosition({
      containerRect,
      targetRect: cardRect,
      position: "before",
      gap: 16,
      align: "center",
      crossOffset: 5,
    })
    // align=center ⇒ top = (targetTop - containerTop) + targetHeight/2 + crossOffset = 30 + 50 + 5 = 85.
    expect(result.top).toBe(85)
  })

  it("uses container height when span is 'container'", () => {
    const result = computeVerticalIndicatorPosition({
      containerRect,
      targetRect: cardRect,
      position: "before",
      span: "container",
    })
    expect(result.height).toBe(200)
  })
})

describe("computeHorizontalIndicatorPosition", () => {
  it("places the indicator above the target for 'before'", () => {
    const result = computeHorizontalIndicatorPosition({
      containerRect,
      targetRect: cardRect,
      position: "before",
      gap: 16,
    })
    expect(result.top).toBe(30 - 8)
  })

  it("places the indicator below the target for 'after'", () => {
    const result = computeHorizontalIndicatorPosition({
      containerRect,
      targetRect: cardRect,
      position: "after",
      gap: 16,
    })
    expect(result.top).toBe(130 + 8)
  })

  it("derives width via lengthStrategy applied to target width", () => {
    const result = computeHorizontalIndicatorPosition({
      containerRect,
      targetRect: cardRect,
      position: "after",
      lengthStrategy: (w) => w - 10,
    })
    expect(result.width).toBe(90)
  })

  it("respects minLength and maxLength", () => {
    const result = computeHorizontalIndicatorPosition({
      containerRect,
      targetRect: cardRect,
      position: "after",
      span: 30,
      minLength: 50,
    })
    expect(result.width).toBe(50)
  })
})
