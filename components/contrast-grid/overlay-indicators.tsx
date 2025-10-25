"use client"

import type { OverlayStyle } from "@/components/contrast-grid/types"

type OverlayIndicatorsProps = {
  foregroundOverlay: OverlayStyle
  backgroundOverlay: OverlayStyle
  foregroundSwapHighlight: OverlayStyle
  backgroundSwapHighlight: OverlayStyle
}

export function OverlayIndicators({
  foregroundOverlay,
  backgroundOverlay,
  foregroundSwapHighlight,
  backgroundSwapHighlight,
}: OverlayIndicatorsProps) {
  return (
    <>
      {foregroundOverlay && (
        <div className="pointer-events-none fixed z-40 rounded-lg bg-blue-500/10" style={foregroundOverlay} />
      )}
      {backgroundOverlay && (
        <div className="pointer-events-none fixed z-40 rounded-lg bg-blue-500/10" style={backgroundOverlay} />
      )}
      {foregroundSwapHighlight && (
        <div
          className="pointer-events-none fixed z-40 rounded-lg bg-blue-500/10 border-2 border-blue-500 border-dashed"
          style={foregroundSwapHighlight}
        />
      )}
      {backgroundSwapHighlight && (
        <div
          className="pointer-events-none fixed z-40 rounded-lg bg-blue-500/10 border-2 border-blue-500 border-dashed"
          style={backgroundSwapHighlight}
        />
      )}
    </>
  )
}
