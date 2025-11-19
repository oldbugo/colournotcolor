import type { InsertPosition } from "@/lib/index-dnd"

type RectLike = Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">

export type VerticalIndicatorPosition = {
  left: number
  top: number
  height: number
}

export type HorizontalIndicatorPosition = {
  left: number
  top: number
  width: number
}

type LengthStrategy = (size: number) => number

type BaseIndicatorOptions = {
  position: InsertPosition
  gap?: number
  offset?: number
  clampInset?: number
  align?: "start" | "center"
  span?: number | "container"
  minLength?: number
  maxLength?: number
  lengthStrategy?: LengthStrategy
  crossOffset?: number
}

export type VerticalIndicatorOptions = BaseIndicatorOptions & {
  containerRect: RectLike
  targetRect: RectLike
}

export type HorizontalIndicatorOptions = BaseIndicatorOptions & {
  containerRect: RectLike
  targetRect: RectLike
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const defaultLengthStrategy: LengthStrategy = (size) => size

const resolveOffset = (gap?: number, fallback = 6) => {
  if (typeof gap === "number" && gap > 0) {
    return gap / 2
  }
  return fallback
}

const resolveLength = (
  dimension: number,
  targetSize: number,
  options: Pick<BaseIndicatorOptions, "span" | "minLength" | "maxLength" | "lengthStrategy">,
) => {
  const { span, minLength, maxLength, lengthStrategy } = options

  let length: number
  if (typeof span === "number") {
    length = span
  } else if (span === "container") {
    length = dimension
  } else {
    const strategy = lengthStrategy ?? defaultLengthStrategy
    length = strategy(Math.max(targetSize, 0))
  }

  if (typeof minLength === "number") {
    length = Math.max(minLength, length)
  }

  if (typeof maxLength === "number") {
    length = Math.min(maxLength, length)
  }

  return Math.max(0, length)
}

export function computeVerticalIndicatorPosition(options: VerticalIndicatorOptions): VerticalIndicatorPosition {
  const { containerRect, targetRect, position, gap, offset, clampInset = 1.5, align = "start", crossOffset = 0 } = options

  const axisOffset = typeof offset === "number" ? offset : resolveOffset(gap)
  const baseLeft =
    position === "before"
      ? targetRect.left - containerRect.left
      : targetRect.right - containerRect.left
  const rawLeft = baseLeft + (position === "before" ? -axisOffset : axisOffset)
  const containerWidth = Math.max(containerRect.width, 1)
  const left = clamp(rawLeft, clampInset, Math.max(clampInset, containerWidth - clampInset))

  const height = resolveLength(containerRect.height, targetRect.height, options)
  const topBase = align === "center" ? targetRect.top - containerRect.top + targetRect.height / 2 : 0
  const top = topBase + crossOffset

  return { left, top, height }
}

export function computeHorizontalIndicatorPosition(options: HorizontalIndicatorOptions): HorizontalIndicatorPosition {
  const { containerRect, targetRect, position, gap, offset, clampInset = 1.5, align = "start", crossOffset = 0 } = options

  const axisOffset = typeof offset === "number" ? offset : resolveOffset(gap)
  const baseTop =
    position === "before"
      ? targetRect.top - containerRect.top
      : targetRect.bottom - containerRect.top
  const rawTop = baseTop + (position === "before" ? -axisOffset : axisOffset)
  const containerHeight = Math.max(containerRect.height, 1)
  const top = clamp(rawTop, clampInset, Math.max(clampInset, containerHeight - clampInset))

  const width = resolveLength(containerRect.width, targetRect.width, options)
  const leftBase = align === "center" ? targetRect.left - containerRect.left + targetRect.width / 2 : 0
  const left = leftBase + crossOffset

  return { left, top, width }
}
