"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Copy, GripVertical, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import type { ColorPalette } from "@/types/palette"

type PaletteListManagerProps = {
  palettes: ColorPalette[]
  activePaletteId: string
  onSelectPalette: (id: string) => void
  onAddPalette: () => void
  onReorderPalettes: (fromIndex: number, toIndex: number) => void
  onDuplicatePalette?: (id: string) => void
  onDeletePalette?: (id: string) => void
  canDeletePalette?: boolean
}

export function PaletteListManager({
  palettes,
  activePaletteId,
  onSelectPalette,
  onAddPalette,
  onReorderPalettes,
  onDuplicatePalette,
  onDeletePalette,
  canDeletePalette = true,
}: PaletteListManagerProps) {
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [pendingDeletePaletteId, setPendingDeletePaletteId] = useState<string | null>(null)
  const pendingDeletePalette = useMemo(
    () => palettes.find((palette) => palette.id === pendingDeletePaletteId) ?? null,
    [palettes, pendingDeletePaletteId],
  )

  useEffect(() => {
    const node = sidebarRef.current
    if (!node) {
      return
    }

    const updateWidth = () => {
      const width = node.offsetWidth
      setSidebarWidth((prev) => (prev === width ? prev : width))
    }

    updateWidth()

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) {
          return
        }
        const width = entry.contentRect.width
        setSidebarWidth((prev) => (Math.abs((prev ?? 0) - width) < 0.5 ? prev : width))
      })
      observer.observe(node)
      return () => {
        observer.disconnect()
      }
    }

    if (typeof window === "undefined") {
      return
    }

    window.addEventListener("resize", updateWidth)
    return () => {
      window.removeEventListener("resize", updateWidth)
    }
  }, [])

  const maxVisiblePerRow = useMemo(() => {
    if (!sidebarWidth || sidebarWidth <= 0) {
      return 2
    }
    const availableWidth = sidebarWidth - 80
    const circleWidth = 28
    const overlap = 8
    const effectiveCircleWidth = circleWidth - overlap
    const maxCircles = Math.floor((availableWidth - circleWidth) / effectiveCircleWidth) + 1
    return Math.max(2, maxCircles - 1)
  }, [sidebarWidth])

  const renderColorRow = (colors: ColorPalette["colors"]) => {
    const visibleColors = colors.slice(0, maxVisiblePerRow)
    const remainingCount = colors.length - visibleColors.length

    return (
      <div className="flex items-center -space-x-2 px-2 py-1.5">
        {visibleColors.map((color, index) => (
          <div
            key={color.id}
            className="h-7 w-7 flex-shrink-0 rounded-full"
            style={{
              backgroundColor: color.hex,
              zIndex: index,
              boxShadow: "0 0 0 2px white, 0 0 0 3px black",
            }}
          />
        ))}
        {remainingCount > 0 && (
          <div
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white"
            style={{
              zIndex: visibleColors.length + 1,
              boxShadow: "0 0 0 2px black",
            }}
          >
            <span className="text-[11px] font-bold leading-none text-black">+{remainingCount}</span>
          </div>
        )}
      </div>
    )
  }

  const handleDragStart = (event: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    event.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (event: React.DragEvent, index: number) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (event: React.DragEvent, index: number) => {
    event.preventDefault()
    if (draggedIndex !== null && draggedIndex !== index) {
      onReorderPalettes(draggedIndex, index)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleConfirmDelete = () => {
    if (!pendingDeletePaletteId) {
      return
    }
    onDeletePalette?.(pendingDeletePaletteId)
    setPendingDeletePaletteId(null)
  }

  const handleTopZoneDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDragOverIndex(0)
  }

  const handleTopZoneDrop = (event: React.DragEvent) => {
    event.preventDefault()
    if (draggedIndex !== null && draggedIndex !== 0) {
      onReorderPalettes(draggedIndex, 0)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div ref={sidebarRef} className="flex h-full flex-col bg-secondary">
      <div className="relative flex-1 space-y-3 overflow-auto px-6 py-4">
        <div className="relative z-50 -mb-8 h-8" onDragOver={handleTopZoneDragOver} onDragLeave={handleDragLeave} onDrop={handleTopZoneDrop}>
          {dragOverIndex === 0 && draggedIndex !== null && draggedIndex !== 0 && (
            <div className="absolute bottom-[36px] left-0 right-0 h-0.5 rounded-full bg-blue-500" />
          )}
        </div>

        {palettes.map((palette, index) => {
          const isCustomPalette = palette.id !== "default"
          const isDragging = draggedIndex === index
          const isDropTarget = dragOverIndex === index && draggedIndex !== index
          const showIndicatorAbove =
            isDropTarget && draggedIndex !== null && draggedIndex > index && !(index === 0 && dragOverIndex === 0)
          const showIndicatorBelow = isDropTarget && draggedIndex !== null && draggedIndex < index

          return (
            <div key={palette.id} className="relative border-0">
              {showIndicatorAbove && (
                <div className="absolute -top-[7px] left-0 right-0 z-50 h-0.5 rounded-full bg-blue-500" />
              )}

              <div
                className={cn(
                  "relative flex w-full flex-1 flex-col items-start gap-2 overflow-hidden rounded-lg border border-border bg-card p-3 py-3 text-left transition-all hover:bg-accent",
                  activePaletteId === palette.id && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                  isDragging && "scale-95 opacity-50",
                  !isCustomPalette && "cursor-pointer",
                )}
              >
                <button
                  type="button"
                  draggable={isCustomPalette}
                  onClick={() => onSelectPalette(palette.id)}
                  onDragStart={(event) => {
                    if (isCustomPalette) {
                      handleDragStart(event, index)
                    }
                  }}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => handleDragOver(event, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(event) => handleDrop(event, index)}
                  className={cn(
                    "absolute inset-0 z-10 cursor-pointer border-0 bg-transparent active:cursor-grabbing",
                    isCustomPalette && "cursor-grab",
                  )}
                  aria-label={`Select ${palette.name}`}
                />

                <div className="relative z-20 flex w-full items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex w-full flex-col gap-3">{renderColorRow(palette.colors)}</div>
                    <span className="block truncate text-xs text-foreground">{palette.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {isCustomPalette && <GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                    {onDuplicatePalette && (
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-xs transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        aria-label={`Duplicate ${palette.name}`}
                        title={`Duplicate ${palette.name}`}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          onDuplicatePalette(palette.id)
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDeletePalette && (
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-xs transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Delete ${palette.name}`}
                        title={canDeletePalette ? `Delete ${palette.name}` : "You must keep at least one palette"}
                        disabled={!canDeletePalette}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          if (canDeletePalette) {
                            setPendingDeletePaletteId(palette.id)
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {showIndicatorBelow && (
                <div className="absolute -bottom-[7px] left-0 right-0 z-50 h-0.5 rounded-full bg-blue-500" />
              )}
            </div>
          )
        })}

        <Button
          variant="outline"
          className="w-full cursor-pointer rounded-lg border bg-transparent font-semibold"
          onClick={onAddPalette}
        >
          + New Palette
        </Button>
      </div>

      <AlertDialog open={!!pendingDeletePalette} onOpenChange={(open) => !open && setPendingDeletePaletteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Palette</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{pendingDeletePalette?.name ?? "this palette"}&rdquo;? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
