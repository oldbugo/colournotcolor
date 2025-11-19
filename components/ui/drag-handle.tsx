"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type DragHandleProps = React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Determines the visual treatment of the handle.
   */
  variant?: "inline" | "pill"
  /**
   * Highlights the handle (used when it should appear active).
   */
  highlighted?: boolean
  /**
   * Number of grip lines rendered.
   */
  lines?: 1 | 2 | 3
  /**
   * Additional class applied to each grip line.
   */
  lineClassName?: string
  /**
   * Orientation of each grip line.
   */
  orientation?: "horizontal" | "vertical"
}

export const DragHandle = React.forwardRef<HTMLDivElement, DragHandleProps>(function DragHandle(
  { variant = "inline", highlighted = false, lines = 2, lineClassName, orientation = "horizontal", className, ...props },
  forwardedRef,
) {
  const isPill = variant === "pill"
  const isVertical = orientation === "vertical"

  const baseLineClass = (() => {
    if (isPill) {
      return isVertical ? "h-5 w-px rounded-full bg-foreground/40 transition-colors" : "h-px w-5 rounded-full bg-foreground/40 transition-colors"
    }
    return isVertical ? "h-8 w-0.5 rounded-full bg-foreground/40 transition-colors" : "h-0.5 w-8 rounded-full bg-foreground/40 transition-colors"
  })()

  const rootClass =
    isPill
      ? cn(
          "flex h-6 w-16 items-center justify-center gap-1 rounded-full bg-white text-muted-foreground transition cursor-grab active:cursor-grabbing",
          isVertical ? "flex-row" : "flex-col",
          highlighted ? "bg-slate-200 text-slate-700" : "hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200",
          className,
        )
      : cn(
          "flex cursor-grab active:cursor-grabbing gap-1 rounded p-2 hover:bg-foreground/5 transition",
          isVertical ? "flex-row" : "flex-col",
          highlighted ? "bg-foreground/10" : "",
          className,
        )

  const roleProps =
    variant === "pill"
      ? ({
          role: "button",
          tabIndex: 0,
        } satisfies React.HTMLAttributes<HTMLDivElement>)
      : {}

  return (
    <div ref={forwardedRef} className={rootClass} {...roleProps} {...props}>
      {Array.from({ length: lines }).map((_, index) => (
        <span key={index} className={cn(baseLineClass, lineClassName)} />
      ))}
    </div>
  )
})

