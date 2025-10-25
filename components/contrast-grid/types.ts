"use client"

import type React from "react"

export type VerticalIndicatorPosition = {
  left: number
  top: number
  height?: number
}

export type HorizontalIndicatorPosition = {
  left: number
  top: number
  width?: number
}

export type OverlayStyle = React.CSSProperties | null
