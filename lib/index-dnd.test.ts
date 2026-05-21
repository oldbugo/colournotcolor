import { describe, expect, it } from "vitest"

import {
  DEFAULT_DRAG_THRESHOLDS,
  computeDragMode,
  computeInsertTargetIndex,
  computePaletteInsertion,
} from "./index-dnd"

describe("computeDragMode", () => {
  describe("with default thresholds (before=0.2, after=0.8)", () => {
    it("returns 'insert before' below the before threshold", () => {
      expect(computeDragMode(0)).toEqual({ mode: "insert", insertPosition: "before" })
      expect(computeDragMode(0.19)).toEqual({ mode: "insert", insertPosition: "before" })
    })

    it("returns 'swap' inside the middle band", () => {
      expect(computeDragMode(0.2)).toEqual({ mode: "swap", insertPosition: null })
      expect(computeDragMode(0.5)).toEqual({ mode: "swap", insertPosition: null })
      expect(computeDragMode(0.8)).toEqual({ mode: "swap", insertPosition: null })
    })

    it("returns 'insert after' above the after threshold", () => {
      expect(computeDragMode(0.81)).toEqual({ mode: "insert", insertPosition: "after" })
      expect(computeDragMode(1)).toEqual({ mode: "insert", insertPosition: "after" })
    })

    it("clamps ratios outside [0, 1] before deciding", () => {
      expect(computeDragMode(-0.5)).toEqual({ mode: "insert", insertPosition: "before" })
      expect(computeDragMode(1.5)).toEqual({ mode: "insert", insertPosition: "after" })
    })

    it("treats NaN as the middle band", () => {
      expect(computeDragMode(Number.NaN)).toEqual({ mode: "swap", insertPosition: null })
    })
  })

  it("accepts custom thresholds", () => {
    const thresholds = { before: 0.3, after: 0.7 }
    expect(computeDragMode(0.25, thresholds)).toEqual({ mode: "insert", insertPosition: "before" })
    expect(computeDragMode(0.5, thresholds)).toEqual({ mode: "swap", insertPosition: null })
    expect(computeDragMode(0.75, thresholds)).toEqual({ mode: "insert", insertPosition: "after" })
  })

  it("DEFAULT_DRAG_THRESHOLDS exposes the canonical bands", () => {
    expect(DEFAULT_DRAG_THRESHOLDS).toEqual({ before: 0.2, after: 0.8 })
  })
})

describe("computeInsertTargetIndex", () => {
  it("returns null for empty arrays", () => {
    expect(
      computeInsertTargetIndex({
        draggedIndex: 0,
        dragOverIndex: 0,
        insertPosition: "before",
        length: 0,
      }),
    ).toBeNull()
  })

  it("returns null when the indices are out of range", () => {
    expect(
      computeInsertTargetIndex({
        draggedIndex: -1,
        dragOverIndex: 0,
        insertPosition: "before",
        length: 3,
      }),
    ).toBeNull()
    expect(
      computeInsertTargetIndex({
        draggedIndex: 0,
        dragOverIndex: 5,
        insertPosition: "before",
        length: 3,
      }),
    ).toBeNull()
  })

  it("returns the target index for an 'insert before' from a later position", () => {
    // Items: [A, B, C, D]; drag D over B and drop "before" → target index 1.
    expect(
      computeInsertTargetIndex({
        draggedIndex: 3,
        dragOverIndex: 1,
        insertPosition: "before",
        length: 4,
      }),
    ).toBe(1)
  })

  it("returns the target index for an 'insert after' from a later position", () => {
    // Items: [A, B, C, D]; drag D over B and drop "after" → target index 2.
    expect(
      computeInsertTargetIndex({
        draggedIndex: 3,
        dragOverIndex: 1,
        insertPosition: "after",
        length: 4,
      }),
    ).toBe(2)
  })

  it("adjusts when the dragged item is before the target ('insert before')", () => {
    // Items: [A, B, C, D]; drag A over C and drop "before" — the dragged
    // item leaves a hole at index 0, so the effective target becomes 1.
    expect(
      computeInsertTargetIndex({
        draggedIndex: 0,
        dragOverIndex: 2,
        insertPosition: "before",
        length: 4,
      }),
    ).toBe(1)
  })

  it("adjusts when the dragged item is before the target ('insert after')", () => {
    // Items: [A, B, C, D]; drag A over C and drop "after" → target index 2.
    expect(
      computeInsertTargetIndex({
        draggedIndex: 0,
        dragOverIndex: 2,
        insertPosition: "after",
        length: 4,
      }),
    ).toBe(2)
  })

  it("clamps the result to the array bounds", () => {
    // Drag last to last "after" → clamps to length.
    expect(
      computeInsertTargetIndex({
        draggedIndex: 3,
        dragOverIndex: 3,
        insertPosition: "after",
        length: 4,
      }),
    ).toBe(3)
  })
})

describe("computePaletteInsertion", () => {
  it("returns null when palette is empty", () => {
    expect(
      computePaletteInsertion({
        baseIndexes: [],
        draggedIndex: 0,
        targetIndex: 0,
        paletteLength: 0,
      }),
    ).toBeNull()
  })

  it("returns null when draggedIndex maps to an undefined base index", () => {
    expect(
      computePaletteInsertion({
        baseIndexes: [undefined, 0, 1],
        draggedIndex: 0,
        targetIndex: 1,
        paletteLength: 2,
      }),
    ).toBeNull()
  })

  it("returns the from/insertion pair when dragging a later item earlier", () => {
    // View indices [0, 1, 2] map to palette indices [2, 5, 8].
    // Drag view index 2 (palette 8) to view index 0 (palette 2) before it.
    // baseIndexes[0] === 2 → insertBeforeBase = 2.
    // insertBeforeBase (2) > fromIndex (8)? no → insertionIndex stays at 2.
    // clamped to [0, paletteLength-1] = [0, 9] → 2.
    expect(
      computePaletteInsertion({
        baseIndexes: [2, 5, 8],
        draggedIndex: 2,
        targetIndex: 0,
        paletteLength: 10,
      }),
    ).toEqual({ fromIndex: 8, insertionIndex: 2 })
  })

  it("subtracts one when inserting after the dragged source", () => {
    // baseIndexes [2, 5, 8], drag view index 0 (palette 2) to target index 2.
    // insertBeforeBase = baseIndexes[2] = 8.
    // 8 > fromIndex(2) → insertionIndex = 7.
    expect(
      computePaletteInsertion({
        baseIndexes: [2, 5, 8],
        draggedIndex: 0,
        targetIndex: 2,
        paletteLength: 10,
      }),
    ).toEqual({ fromIndex: 2, insertionIndex: 7 })
  })

  it("uses paletteLength when targetIndex points past the last base", () => {
    expect(
      computePaletteInsertion({
        baseIndexes: [2, 5, 8],
        draggedIndex: 0,
        targetIndex: 3,
        paletteLength: 10,
      }),
    ).toEqual({ fromIndex: 2, insertionIndex: 9 })
  })
})
