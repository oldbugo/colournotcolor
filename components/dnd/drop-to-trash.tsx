"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"

type DropToTrashProps = {
  active: boolean
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void
  variant?: "floating" | "inline"
  label?: string
  activeLabel?: string
  leaveDelay?: number
  className?: string
  contentClassName?: string
  children?: React.ReactNode
  onDragStateChange?: (isOver: boolean) => void
}

export function DropToTrash({
  active,
  onDrop,
  variant = "floating",
  label = "Delete",
  activeLabel = "Drop to Delete",
  leaveDelay = 200,
  className,
  contentClassName,
  children,
  onDragStateChange,
}: DropToTrashProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const clearLeaveTimeout = useCallback(() => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current)
      leaveTimeoutRef.current = null
    }
  }, [])

  const setDragOverState = useCallback(
    (next: boolean) => {
      setIsDragOver(next)
      onDragStateChange?.(next)
    },
    [onDragStateChange],
  )

  useEffect(() => {
    return () => {
      clearLeaveTimeout()
    }
  }, [clearLeaveTimeout])

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!active) return
      event.preventDefault()
      clearLeaveTimeout()
      if (!isDragOver) {
        setDragOverState(true)
      }
    },
    [active, clearLeaveTimeout, isDragOver, setDragOverState],
  )

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!active) return

      const related = event.relatedTarget as Node | null
      const stillInside = related ? rootRef.current?.contains(related) : false
      if (stillInside) {
        return
      }

      clearLeaveTimeout()
      leaveTimeoutRef.current = setTimeout(() => {
        setDragOverState(false)
        leaveTimeoutRef.current = null
      }, leaveDelay)
    },
    [active, clearLeaveTimeout, leaveDelay, setDragOverState],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!active) return
      event.preventDefault()
      clearLeaveTimeout()
      setDragOverState(false)
      onDrop(event)
    },
    [active, clearLeaveTimeout, onDrop, setDragOverState],
  )

  const content =
    children ??
    (variant === "inline" ? (
      <div
        className={cn(
          "flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 text-sm font-medium transition-all duration-200",
          isDragOver ? "border-rose-500 bg-rose-50 text-rose-600" : "border-border/60 bg-transparent text-muted-foreground",
          contentClassName,
        )}
      >
        <Trash2 className={cn("h-5 w-5 transition-all duration-200", isDragOver ? "text-rose-600" : "text-muted-foreground")} />
        <span>{isDragOver ? activeLabel : label}</span>
      </div>
    ) : (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-all duration-200",
          isDragOver ? "border-rose-500 bg-rose-100/80 shadow-lg" : "border-gray-400 bg-gray-100",
          contentClassName,
        )}
      >
        <Trash2
          className={cn(
            "transition-all duration-200",
            isDragOver ? "h-10 w-10 text-rose-600" : "h-8 w-8 text-gray-600",
          )}
        />
        <span
          className={cn(
            "text-sm font-medium transition-colors duration-200",
            isDragOver ? "text-rose-600" : "text-gray-600",
          )}
        >
          {isDragOver ? activeLabel : label}
        </span>
      </div>
    ))

  if (!active && variant === "floating") {
    return null
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        variant === "floating" ? "fixed bottom-8 right-8 z-50" : "relative w-full",
        className,
        !active && variant === "inline" ? "pointer-events-none opacity-80" : "",
      )}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-disabled={active ? undefined : true}
    >
      {content}
    </div>
  )
}
