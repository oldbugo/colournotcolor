import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { useContrastFilters } from "./use-contrast-filters"

const STORAGE_KEY = "contrast-grid-number-filters-v1"

function readStored(paletteId: string): unknown {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const parsed = JSON.parse(raw)
  return parsed?.[paletteId] ?? null
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe("useContrastFilters", () => {
  it("returns null filter sets and default step index on first mount", () => {
    const { result } = renderHook(() => useContrastFilters({ paletteId: "p1" }))

    expect(result.current.rowFilterIds).toBeNull()
    expect(result.current.columnFilterIds).toBeNull()
    expect(result.current.rowNumberFilter).toBeNull()
    expect(result.current.columnNumberFilter).toBeNull()
    expect(result.current.filterStepIndex).toBe(1)
    expect(result.current.filtersInitialized).toBe(true)
  })

  it("hydrates filter state from localStorage on mount", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        p1: {
          rowRange: { min: 100, max: 500 },
          columnRange: { min: 0, max: 900 },
          rowIds: ["a", "b"],
          columnIds: null,
          filterStepIndex: 2,
        },
      }),
    )

    const { result } = renderHook(() => useContrastFilters({ paletteId: "p1" }))

    expect(result.current.rowNumberFilter).toEqual({ min: 100, max: 500 })
    expect(result.current.columnNumberFilter).toEqual({ min: 0, max: 900 })
    expect(result.current.rowFilterIds).toEqual(new Set(["a", "b"]))
    expect(result.current.columnFilterIds).toBeNull()
    expect(result.current.filterStepIndex).toBe(2)
  })

  it("clamps a malformed stored step index back to the default", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        p1: {
          rowRange: null,
          columnRange: null,
          rowIds: null,
          columnIds: null,
          filterStepIndex: 999,
        },
      }),
    )

    const { result } = renderHook(() => useContrastFilters({ paletteId: "p1" }))

    expect(result.current.filterStepIndex).toBe(1)
  })

  it("persists state changes back to localStorage", () => {
    const { result } = renderHook(() => useContrastFilters({ paletteId: "p1" }))

    act(() => {
      result.current.setRowNumberFilter({ min: 10, max: 90 })
      result.current.setColumnFilterIds(new Set(["x"]))
      result.current.setFilterStepIndex(3)
    })

    const stored = readStored("p1") as Record<string, unknown> | null
    expect(stored).toMatchObject({
      rowRange: { min: 10, max: 90 },
      columnIds: ["x"],
      filterStepIndex: 3,
    })
  })

  it("re-hydrates when paletteId changes", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        p1: {
          rowRange: { min: 1, max: 2 },
          columnRange: null,
          rowIds: null,
          columnIds: null,
          filterStepIndex: 0,
        },
        p2: {
          rowRange: { min: 99, max: 100 },
          columnRange: null,
          rowIds: ["only-in-p2"],
          columnIds: null,
          filterStepIndex: 3,
        },
      }),
    )

    const { result, rerender } = renderHook(
      ({ paletteId }: { paletteId: string }) => useContrastFilters({ paletteId }),
      { initialProps: { paletteId: "p1" } },
    )

    expect(result.current.rowNumberFilter).toEqual({ min: 1, max: 2 })
    expect(result.current.filterStepIndex).toBe(0)

    rerender({ paletteId: "p2" })

    expect(result.current.rowNumberFilter).toEqual({ min: 99, max: 100 })
    expect(result.current.rowFilterIds).toEqual(new Set(["only-in-p2"]))
    expect(result.current.filterStepIndex).toBe(3)
  })

  it("mirrors the row number filter into the row number inputs", () => {
    const { result } = renderHook(() => useContrastFilters({ paletteId: "p1" }))

    act(() => {
      result.current.setRowNumberFilter({ min: 25, max: 75 })
    })

    expect(result.current.rowNumberInputs).toEqual({ min: "25", max: "75" })

    act(() => {
      result.current.setRowNumberFilter(null)
    })

    expect(result.current.rowNumberInputs).toEqual({ min: "", max: "" })
  })

  it("mirrors the column number filter into the column number inputs", () => {
    const { result } = renderHook(() => useContrastFilters({ paletteId: "p1" }))

    act(() => {
      result.current.setColumnNumberFilter({ min: 5, max: 50 })
    })

    expect(result.current.columnNumberInputs).toEqual({ min: "5", max: "50" })
  })
})
