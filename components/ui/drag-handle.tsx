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
}

export const DragHandle = React.forwardRef<HTMLDivElement, DragHandleProps>(function DragHandle(
  { variant = "inline", highlighted = false, lines = 2, lineClassName, className, ...props },
  forwardedRef,
) {
  const baseLineClass =
    variant === "inline"
      ? "h-0.5 w-8 rounded-full bg-foreground/40 transition-colors"
      : "h-px w-5 rounded-full bg-foreground/40 transition-colors"

  const rootClass =
    variant === "pill"
      ? cn(
          "flex h-6 w-16 flex-col items-center justify-center gap-1 rounded-full bg-white text-muted-foreground transition cursor-grab active:cursor-grabbing",
          highlighted ? "bg-slate-200 text-slate-700" : "hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200",
          className,
        )
      : cn(
          "flex cursor-grab active:cursor-grabbing flex-col gap-1 rounded p-2 hover:bg-foreground/5 transition",
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

