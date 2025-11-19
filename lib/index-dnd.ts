export type DragMode = "swap" | "insert"
export type InsertPosition = "before" | "after"

export type DragIntent = {
  mode: DragMode
  insertPosition: InsertPosition | null
}

export type DragThresholds = {
  before: number
  after: number
}

export const DEFAULT_DRAG_THRESHOLDS: DragThresholds = {
  before: 0.2,
  after: 0.8,
}

export type InsertTargetOptions = {
  draggedIndex: number
  dragOverIndex: number
  insertPosition: InsertPosition
  length: number
}

export type PaletteInsertionOptions = {
  baseIndexes: Array<number | undefined>
  draggedIndex: number
  targetIndex: number
  paletteLength: number
}

export type PaletteInsertionResult = {
  fromIndex: number
  insertionIndex: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const getPointerRatio = (pointerRatio: number) => {
  if (!Number.isFinite(pointerRatio)) {
    return 0.5
  }
  return clamp(pointerRatio, 0, 1)
}

export function computeDragMode(
  pointerRatio: number,
  thresholds: DragThresholds = DEFAULT_DRAG_THRESHOLDS,
): DragIntent {
  const ratio = getPointerRatio(pointerRatio)
  const beforeThreshold = thresholds.before ?? DEFAULT_DRAG_THRESHOLDS.before
  const afterThreshold = thresholds.after ?? DEFAULT_DRAG_THRESHOLDS.after

  if (ratio < beforeThreshold) {
    return { mode: "insert", insertPosition: "before" }
  }

  if (ratio > afterThreshold) {
    return { mode: "insert", insertPosition: "after" }
  }

  return { mode: "swap", insertPosition: null }
}

export function computeInsertTargetIndex(options: InsertTargetOptions): number | null {
  const { draggedIndex, dragOverIndex, insertPosition, length } = options
  if (length <= 0) {
    return null
  }

  if (
    draggedIndex < 0 ||
    draggedIndex >= length ||
    dragOverIndex < 0 ||
    dragOverIndex >= length ||
    !insertPosition
  ) {
    return null
  }

  let targetIndex = dragOverIndex
  if (insertPosition === "after") {
    targetIndex += 1
  }

  if (draggedIndex < targetIndex) {
    targetIndex -= 1
  }

  return clamp(targetIndex, 0, length)
}

export function computePaletteInsertion(options: PaletteInsertionOptions): PaletteInsertionResult | null {
  const { baseIndexes, draggedIndex, targetIndex, paletteLength } = options
  if (paletteLength <= 0) {
    return null
  }

  const fromIndex = baseIndexes[draggedIndex]
  if (typeof fromIndex !== "number") {
    return null
  }

  const boundedTargetIndex = clamp(targetIndex, 0, baseIndexes.length)
  const insertBeforeBase =
    boundedTargetIndex >= baseIndexes.length ? paletteLength : baseIndexes[boundedTargetIndex]

  if (typeof insertBeforeBase !== "number") {
    return null
  }

  let insertionIndex = insertBeforeBase
  if (insertionIndex > fromIndex) {
    insertionIndex -= 1
  }

  insertionIndex = clamp(insertionIndex, 0, Math.max(paletteLength - 1, 0))

  return { fromIndex, insertionIndex }
}
