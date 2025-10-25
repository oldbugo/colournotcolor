import type { DropMode } from "@/lib/dnd-utils"
import { cn } from "@/lib/utils"

type DropIndicatorProps = {
  active: boolean
  mode: DropMode | null
  orientation: "horizontal" | "vertical"
  className?: string
  gap?: number
}

export function DropIndicator({ active, mode, orientation, className, gap = 0 }: DropIndicatorProps) {
  if (!active || !mode) return null

  if (mode === "swap") {
    return (
      <div
        className={cn(
          "pointer-events-none absolute -inset-1 rounded-lg border-2 border-blue-500 border-dashed bg-blue-500/10 shadow-[0_0_8px_rgba(59,130,246,0.25)]",
          className,
        )}
      />
    )
  }

  const style: React.CSSProperties = {}
  const halfGap = gap / 2

  if (orientation === "horizontal") {
    style.top = "0.5rem"
    style.bottom = "0.5rem"
    if (mode === "before") {
      style.left = 0
      style.transform = "translateX(-50%)"
      if (halfGap) style.marginLeft = -halfGap
    } else {
      style.right = 0
      style.transform = "translateX(50%)"
      if (halfGap) style.marginRight = -halfGap
    }
  } else {
    style.left = "0.5rem"
    style.right = "0.5rem"
    if (mode === "before") {
      style.top = 0
      style.transform = "translateY(-50%)"
      if (halfGap) style.marginTop = -halfGap
    } else {
      style.bottom = 0
      style.transform = "translateY(50%)"
      if (halfGap) style.marginBottom = -halfGap
    }
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.35)]",
        orientation === "horizontal" ? "w-1" : "h-1",
        className,
      )}
      style={style}
    />
  )
}
