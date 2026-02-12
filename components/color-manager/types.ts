import type { VerticalIndicatorPosition } from "@/lib/dnd-indicators"

export type ColorWithName = {
  name: string
  hex: string
  originalIndex: number
}

export type ColorFormatMode = "hex" | "hsluv"

export type DragIndicatorPosition = VerticalIndicatorPosition
