import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { createRef, useRef, type MutableRefObject } from "react"

import { useHeaderDnd } from "./use-header-dnd"

const DEFAULT_GEOMETRY = {
  cardWithGap: 148,
  gapSize: 16,
  animationDuration: 0.25,
  rowLabelWidth: 164,
}

type HookOptions = Parameters<typeof useHeaderDnd>[0]

function buildHookOptions(overrides: Partial<HookOptions> = {}): HookOptions {
  return {
    foregroundBaseIndexes: [0, 1, 2],
    backgroundBaseIndexes: [0, 1, 2],
    foregroundColumnCount: 3,
    backgroundRowCount: 3,
    colorsLength: 3,
    gridRef: { current: document.createElement("div") } as MutableRefObject<HTMLDivElement | null>,
    fgHeaderRefs: { current: new Map<number, HTMLDivElement>() } as MutableRefObject<Map<number, HTMLDivElement>>,
    bgLabelRefs: { current: new Map<number, HTMLDivElement>() } as MutableRefObject<Map<number, HTMLDivElement>>,
    geometry: DEFAULT_GEOMETRY,
    onSwapColors: vi.fn(),
    onReorderColors: vi.fn(),
    onColorEdit: vi.fn(),
    onRemoveColor: vi.fn(),
    ...overrides,
  }
}

function buildDragStartEvent() {
  return {
    dataTransfer: { effectAllowed: "" },
  } as unknown as React.DragEvent
}

function buildDragOverEvent({
  ratio,
  axis = "x",
  rect = { width: 100, height: 100, left: 0, top: 0 },
}: {
  ratio: number
  axis?: "x" | "y"
  rect?: { width: number; height: number; left: number; top: number }
}) {
  const clientX = axis === "x" ? rect.left + ratio * rect.width : rect.left + rect.width / 2
  const clientY = axis === "y" ? rect.top + ratio * rect.height : rect.top + rect.height / 2
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    currentTarget: {
      getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
    },
    clientX,
    clientY,
  } as unknown as React.DragEvent
}

function buildDropEvent() {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.DragEvent<HTMLDivElement>
}

describe("useHeaderDnd", () => {
  it("starts with all drag state empty and isAnyHeaderDragging false", () => {
    const { result } = renderHook(() => useHeaderDnd(buildHookOptions()))

    expect(result.current.draggedFgIndex).toBeNull()
    expect(result.current.draggedBgIndex).toBeNull()
    expect(result.current.fgDragMode).toBeNull()
    expect(result.current.bgDragMode).toBeNull()
    expect(result.current.isAnyHeaderDragging).toBe(false)
  })

  it("sets effectAllowed and draggedFgIndex when an FG drag begins", () => {
    const { result } = renderHook(() => useHeaderDnd(buildHookOptions()))
    const event = buildDragStartEvent()

    act(() => {
      result.current.handleFgDragStart(event, 1)
    })

    expect(event.dataTransfer.effectAllowed).toBe("move")
    expect(result.current.draggedFgIndex).toBe(1)
    expect(result.current.isAnyHeaderDragging).toBe(true)
  })

  it("resolves dragOver pointer ratio into swap intent when near the centre", () => {
    const { result } = renderHook(() => useHeaderDnd(buildHookOptions()))

    act(() => {
      result.current.handleFgDragStart(buildDragStartEvent(), 0)
    })
    act(() => {
      result.current.handleFgDragOver(buildDragOverEvent({ ratio: 0.5 }), 2)
    })

    expect(result.current.fgDragMode).toBe("swap")
  })

  it("resolves dragOver pointer ratio into insert-before intent near the left edge", () => {
    const { result } = renderHook(() => useHeaderDnd(buildHookOptions()))

    act(() => {
      result.current.handleFgDragStart(buildDragStartEvent(), 0)
    })
    act(() => {
      result.current.handleFgDragOver(buildDragOverEvent({ ratio: 0.05 }), 2)
    })

    expect(result.current.fgDragMode).toBe("insert")
  })

  it("calls onSwapColors with the correct base indexes on FG swap drop", () => {
    const onSwapColors = vi.fn()
    const { result } = renderHook(() =>
      useHeaderDnd(
        buildHookOptions({
          foregroundBaseIndexes: [4, 2, 7],
          onSwapColors,
        }),
      ),
    )

    act(() => {
      result.current.handleFgDragStart(buildDragStartEvent(), 0)
    })
    act(() => {
      result.current.handleFgDragOver(buildDragOverEvent({ ratio: 0.5 }), 2)
    })
    act(() => {
      result.current.handleFgDrop(buildDropEvent())
    })

    expect(onSwapColors).toHaveBeenCalledWith(4, 7)
    expect(result.current.draggedFgIndex).toBeNull()
    expect(result.current.fgDragMode).toBeNull()
  })

  it("calls onReorderColors when an FG insert drop is committed", () => {
    const onReorderColors = vi.fn()
    const { result } = renderHook(() =>
      useHeaderDnd(
        buildHookOptions({
          foregroundBaseIndexes: [4, 2, 7],
          colorsLength: 8,
          onReorderColors,
        }),
      ),
    )

    act(() => {
      result.current.handleFgDragStart(buildDragStartEvent(), 0)
    })
    act(() => {
      result.current.handleFgDragOver(buildDragOverEvent({ ratio: 0.95 }), 2)
    })
    act(() => {
      result.current.handleFgDrop(buildDropEvent())
    })

    expect(onReorderColors).toHaveBeenCalled()
    const [fromIndex, toIndex] = onReorderColors.mock.calls[0]
    expect(fromIndex).toBe(4)
    expect(typeof toIndex).toBe("number")
  })

  it("resets all FG drag state via handleFgDragEnd", () => {
    const { result } = renderHook(() => useHeaderDnd(buildHookOptions()))

    act(() => {
      result.current.handleFgDragStart(buildDragStartEvent(), 1)
    })
    act(() => {
      result.current.handleFgDragOver(buildDragOverEvent({ ratio: 0.5 }), 2)
    })

    expect(result.current.isAnyHeaderDragging).toBe(true)

    act(() => {
      result.current.handleFgDragEnd()
    })

    expect(result.current.draggedFgIndex).toBeNull()
    expect(result.current.fgDragMode).toBeNull()
    expect(result.current.isAnyHeaderDragging).toBe(false)
  })

  it("handles BG drag axis correctly (y-axis pointer ratio)", () => {
    const onSwapColors = vi.fn()
    const { result } = renderHook(() =>
      useHeaderDnd(
        buildHookOptions({
          backgroundBaseIndexes: [9, 5, 1],
          onSwapColors,
        }),
      ),
    )

    act(() => {
      result.current.handleBgDragStart(buildDragStartEvent(), 0)
    })
    act(() => {
      result.current.handleBgDragOver(buildDragOverEvent({ ratio: 0.5, axis: "y" }), 1)
    })
    act(() => {
      result.current.handleBgDrop(buildDropEvent())
    })

    expect(result.current.bgDragMode).toBeNull() // reset after drop
    expect(onSwapColors).toHaveBeenCalledWith(9, 5)
  })

  it("ignores dragOver on the originating index", () => {
    const { result } = renderHook(() => useHeaderDnd(buildHookOptions()))

    act(() => {
      result.current.handleFgDragStart(buildDragStartEvent(), 1)
    })
    act(() => {
      result.current.handleFgDragOver(buildDragOverEvent({ ratio: 0.5 }), 1)
    })

    expect(result.current.fgDragMode).toBeNull()
  })

  it("does not cross-pollinate FG and BG drags", () => {
    const onSwapColors = vi.fn()
    const { result } = renderHook(() =>
      useHeaderDnd(
        buildHookOptions({
          onSwapColors,
        }),
      ),
    )

    act(() => {
      result.current.handleFgDragStart(buildDragStartEvent(), 0)
    })
    // While an FG drag is active, BG dragOver should be ignored
    act(() => {
      result.current.handleBgDragOver(buildDragOverEvent({ ratio: 0.5, axis: "y" }), 1)
    })

    expect(result.current.bgDragMode).toBeNull()
    expect(result.current.dragOverBgIndex ?? null).toBeNull()
  })

  it("removes via trash when an FG drag is dropped on the trash", () => {
    const onRemoveColor = vi.fn()
    const onColorEdit = vi.fn()
    const { result } = renderHook(() =>
      useHeaderDnd(
        buildHookOptions({
          foregroundBaseIndexes: [4, 2, 7],
          onRemoveColor,
          onColorEdit,
        }),
      ),
    )

    act(() => {
      result.current.handleFgDragStart(buildDragStartEvent(), 2)
    })
    act(() => {
      result.current.handleDropOnTrash(buildDropEvent())
    })

    expect(onColorEdit).toHaveBeenCalledWith(-1)
    expect(onRemoveColor).toHaveBeenCalledWith(7)
    expect(result.current.draggedFgIndex).toBeNull()
  })

  it("removes via trash when a BG drag is dropped on the trash", () => {
    const onRemoveColor = vi.fn()
    const { result } = renderHook(() =>
      useHeaderDnd(
        buildHookOptions({
          backgroundBaseIndexes: [9, 5, 1],
          onRemoveColor,
        }),
      ),
    )

    act(() => {
      result.current.handleBgDragStart(buildDragStartEvent(), 1)
    })
    act(() => {
      result.current.handleDropOnTrash(buildDropEvent())
    })

    expect(onRemoveColor).toHaveBeenCalledWith(5)
    expect(result.current.draggedBgIndex).toBeNull()
  })

  it("handleFgHeaderClick fires onColorEdit with the underlying base index", () => {
    const onColorEdit = vi.fn()
    const { result } = renderHook(() =>
      useHeaderDnd(
        buildHookOptions({
          foregroundBaseIndexes: [10, 20, 30],
          onColorEdit,
        }),
      ),
    )

    const event = {
      target: { closest: () => null },
    } as unknown as React.MouseEvent

    act(() => {
      result.current.handleFgHeaderClick(1, event)
    })

    expect(onColorEdit).toHaveBeenCalledWith(20)
  })

  it("handleFgHeaderClick is suppressed when the click originated on the drag handle", () => {
    const onColorEdit = vi.fn()
    const { result } = renderHook(() =>
      useHeaderDnd(
        buildHookOptions({
          onColorEdit,
        }),
      ),
    )

    const event = {
      target: { closest: (selector: string) => (selector === "[data-drag-handle]" ? {} : null) },
    } as unknown as React.MouseEvent

    act(() => {
      result.current.handleFgHeaderClick(0, event)
    })

    expect(onColorEdit).not.toHaveBeenCalled()
  })

  it("animation helpers return the expected style for the dragged target index", () => {
    const { result } = renderHook(() => useHeaderDnd(buildHookOptions()))

    // No animation state → empty style
    expect(result.current.getFgAnimationStyle(0)).toEqual({})
    expect(result.current.getCellAnimationStyle(0, 0)).toEqual({})
  })

  it("ArrowRight on an FG header swaps with the next column via onSwapColors", () => {
    const onSwapColors = vi.fn()
    const { result } = renderHook(() =>
      useHeaderDnd(
        buildHookOptions({
          foregroundBaseIndexes: [4, 2, 7],
          onSwapColors,
        }),
      ),
    )

    const handled = result.current.handleFgHandleKeyDown(0, {
      key: "ArrowRight",
    } as React.KeyboardEvent)

    expect(handled).toBe(true)
    expect(onSwapColors).toHaveBeenCalledWith(4, 2)
  })

  it("ArrowLeft on the leftmost FG header is a no-op but still consumed", () => {
    const onSwapColors = vi.fn()
    const { result } = renderHook(() =>
      useHeaderDnd(buildHookOptions({ onSwapColors })),
    )

    const handled = result.current.handleFgHandleKeyDown(0, {
      key: "ArrowLeft",
    } as React.KeyboardEvent)

    expect(handled).toBe(true)
    expect(onSwapColors).not.toHaveBeenCalled()
  })

  it("ArrowDown on a BG header swaps with the next row", () => {
    const onSwapColors = vi.fn()
    const { result } = renderHook(() =>
      useHeaderDnd(
        buildHookOptions({
          backgroundBaseIndexes: [9, 5, 1],
          onSwapColors,
        }),
      ),
    )

    const handled = result.current.handleBgHandleKeyDown(1, {
      key: "ArrowDown",
    } as React.KeyboardEvent)

    expect(handled).toBe(true)
    expect(onSwapColors).toHaveBeenCalledWith(5, 1)
  })

  it("non-arrow keys are not handled by either keyboard handler", () => {
    const onSwapColors = vi.fn()
    const { result } = renderHook(() =>
      useHeaderDnd(buildHookOptions({ onSwapColors })),
    )

    expect(
      result.current.handleFgHandleKeyDown(0, { key: "Enter" } as React.KeyboardEvent),
    ).toBe(false)
    expect(
      result.current.handleBgHandleKeyDown(0, { key: "Tab" } as React.KeyboardEvent),
    ).toBe(false)
    expect(onSwapColors).not.toHaveBeenCalled()
  })
})

describe("useHeaderDnd ref handling", () => {
  it("accepts plain RefObject refs (no Map<>) without crashing", () => {
    const { result } = renderHook(() => {
      const gridRef = useRef<HTMLDivElement>(null)
      const fgHeaderRefs = useRef(new Map<number, HTMLDivElement>())
      const bgLabelRefs = useRef(new Map<number, HTMLDivElement>())
      return useHeaderDnd(
        buildHookOptions({
          gridRef,
          fgHeaderRefs,
          bgLabelRefs,
        }),
      )
    })

    expect(result.current.isAnyHeaderDragging).toBe(false)
  })

  it("createRef-style refs also satisfy the hook signature", () => {
    expect(() => {
      renderHook(() =>
        useHeaderDnd(
          buildHookOptions({
            gridRef: createRef<HTMLDivElement>(),
          }),
        ),
      )
    }).not.toThrow()
  })
})
