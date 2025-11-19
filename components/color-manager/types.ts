import type { VerticalIndicatorPosition } from "@/lib/dnd-indicators"

export type ColorWithName = {
  name: string
  hex: string
  originalIndex: number
}

export type ColorFormatMode = "hex" | "hsluv" | "hpluv"

export type DragIndicatorPosition = VerticalIndicatorPosition
