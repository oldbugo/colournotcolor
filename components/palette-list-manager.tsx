"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, Copy, LibraryBig, Trash2 } from "lucide-react"
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
import { createSwatch } from "@/lib/color-utils"
import { PALETTE_TEMPLATES, type PaletteTemplate } from "@/lib/palette-templates"
import { cn } from "@/lib/utils"
import type { ColorPalette, ColorSwatch } from "@/types/palette"

type PreviewColor = {
  id?: string
  hex: string
  name?: string
  group?: string | null
}

type PalettePreviewLayoutOptions = {
  bottomInset: number
  minHeight: number
  maxHeight: number
  maxRows: number
}

const PALETTE_PREVIEW_BOTTOM_INSET = 36
const TEMPLATE_PREVIEW_BOTTOM_INSET = 40
const PREVIEW_ROW_HEIGHT = 14
const PREVIEW_MIN_COLOR_AREA_HEIGHT = 40

const SAVED_PALETTE_PREVIEW_OPTIONS: PalettePreviewLayoutOptions = {
  bottomInset: PALETTE_PREVIEW_BOTTOM_INSET,
  minHeight: 80,
  maxHeight: 164,
  maxRows: 8,
}

const TEMPLATE_PALETTE_PREVIEW_OPTIONS: PalettePreviewLayoutOptions = {
  bottomInset: TEMPLATE_PREVIEW_BOTTOM_INSET,
  minHeight: 96,
  maxHeight: 176,
  maxRows: 8,
}

type PaletteListManagerProps = {
  palettes: ColorPalette[]
  activePaletteId: string
  onSelectPalette: (id: string) => void
  onAddPalette: () => void
  onReorderPalettes: (fromIndex: number, toIndex: number) => void
  onImportPalette?: (palette: { name: string; colors: ColorSwatch[] }) => void
  onDuplicatePalette?: (id: string) => void
  onDeletePalette?: (id: string) => void
  canDeletePalette?: boolean
  onRequestClose?: () => void
}

export function PaletteListManager({
  palettes,
  activePaletteId,
  onSelectPalette,
  onAddPalette,
  onReorderPalettes,
  onImportPalette,
  onDuplicatePalette,
  onDeletePalette,
  canDeletePalette = true,
  onRequestClose,
}: PaletteListManagerProps) {
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [focusedPaletteId, setFocusedPaletteId] = useState<string | null>(null)
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

  const mosaicColumns = useMemo(() => {
    if (!sidebarWidth || sidebarWidth <= 0) {
      return 8
    }

    return Math.max(6, Math.min(18, Math.floor((sidebarWidth - 120) / 22)))
  }, [sidebarWidth])

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

  const handleSelectPalette = (id: string) => {
    onSelectPalette(id)
    onRequestClose?.()
  }

  const handleAddPalette = () => {
    onAddPalette()
    onRequestClose?.()
  }

  const handleImportTemplate = (template: PaletteTemplate) => {
    if (!onImportPalette) {
      return
    }

    onImportPalette({
      name: template.name,
      colors: template.colors.map((color) =>
        createSwatch({
          hex: color.hex,
          name: color.name,
          group: color.group,
        }),
      ),
    })
    setShowTemplates(false)
    onRequestClose?.()
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
        {showTemplates ? (
          <>
            <div className="sticky top-0 z-40 -mx-6 -mt-4 flex items-center justify-between gap-3 border-b border-border bg-secondary/95 px-6 py-3 backdrop-blur">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-xs transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  aria-label="Back to palettes"
                  onClick={() => setShowTemplates(false)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h3 className="truncate text-sm font-semibold text-foreground">Templates</h3>
              </div>
            </div>

            <div className="grid gap-3">
              {PALETTE_TEMPLATES.map((template) => {
                const previewLayout = getPalettePreviewLayout(
                  template.colors.length,
                  mosaicColumns,
                  TEMPLATE_PALETTE_PREVIEW_OPTIONS,
                )

                return (
                  <div
                    key={template.id}
                    className="group relative flex min-h-24 w-full flex-col justify-end overflow-hidden rounded-lg border border-transparent bg-card text-left shadow-xs transition-all duration-200 after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-lg after:border after:border-border after:transition-colors hover:after:border-foreground/25 hover:shadow-md"
                    style={{ minHeight: previewLayout.height }}
                  >
                    <MosaicColorSurface
                      colors={template.colors}
                      columns={mosaicColumns}
                      rows={previewLayout.rows}
                      bottomInset={TEMPLATE_PREVIEW_BOTTOM_INSET}
                    />
                    <div
                      className="pointer-events-none absolute left-1 right-1 top-1 rounded-t-md bg-gradient-to-br from-background/15 via-background/5 to-background/45"
                      style={{ bottom: TEMPLATE_PREVIEW_BOTTOM_INSET }}
                    />
                    <div className="relative z-10 mx-1 mb-1 flex h-9 items-center justify-between gap-2 rounded-b-md border-t border-border/60 bg-background/70 pl-2.5 pr-4 backdrop-blur-xl">
                      <div className="flex min-w-0 max-w-[70%] items-baseline gap-1.5">
                        <span className="truncate text-xs font-semibold text-foreground">{template.name}</span>
                        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                          {template.source} / {template.colors.length} colours
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 cursor-pointer rounded-md border-border/60 bg-background/60 px-2.5 text-xs font-semibold shadow-none transition hover:bg-background/90"
                        onClick={() => handleImportTemplate(template)}
                        disabled={!onImportPalette}
                      >
                        Import
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <>
        <div
          className={cn("relative z-50 -mb-8 h-8", draggedIndex === null && "pointer-events-none")}
          onDragOver={handleTopZoneDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleTopZoneDrop}
        >
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
          const previewLayout = getPalettePreviewLayout(
            palette.colors.length,
            mosaicColumns,
            SAVED_PALETTE_PREVIEW_OPTIONS,
          )
          const isFocusedPalette = focusedPaletteId === palette.id

          return (
            <div key={palette.id} className="relative border-0">
              {showIndicatorAbove && (
                <div className="absolute -top-[7px] left-0 right-0 z-50 h-0.5 rounded-full bg-blue-500" />
              )}

              <div
                role="button"
                tabIndex={0}
                draggable={isCustomPalette}
                aria-label={`Select ${palette.name}`}
                onClick={() => handleSelectPalette(palette.id)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return
                  }

                  event.preventDefault()
                  handleSelectPalette(palette.id)
                }}
                onDragStart={(event) => {
                  if (isCustomPalette) {
                    handleDragStart(event, index)
                  }
                }}
                onDragEnd={handleDragEnd}
                onDragOver={(event) => handleDragOver(event, index)}
                onDragLeave={handleDragLeave}
                onDrop={(event) => handleDrop(event, index)}
                onFocus={() => setFocusedPaletteId(palette.id)}
                onBlur={() => setFocusedPaletteId((id) => (id === palette.id ? null : id))}
                className={cn(
                  "group relative flex min-h-20 w-full flex-1 flex-col justify-end overflow-hidden rounded-lg border border-transparent bg-card text-left shadow-xs outline-2 outline-dashed outline-transparent [outline-offset:var(--interaction-dashed-outline-offset)] transition-all duration-200 after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-lg after:border after:border-border after:transition-colors hover:after:border-foreground/25 hover:shadow-md focus:ring-0 focus-visible:ring-0",
                  (activePaletteId === palette.id || isFocusedPalette) && "outline-interaction-dashed-outline",
                  isDragging && "scale-95 opacity-50",
                  isCustomPalette ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                )}
                style={{ minHeight: previewLayout.height }}
              >
                <MosaicColorSurface
                  colors={palette.colors}
                  columns={mosaicColumns}
                  rows={previewLayout.rows}
                  bottomInset={PALETTE_PREVIEW_BOTTOM_INSET}
                />
                <div
                  className="pointer-events-none absolute left-1 right-1 top-1 rounded-t-md bg-gradient-to-br from-background/15 via-background/5 to-background/45"
                  style={{ bottom: PALETTE_PREVIEW_BOTTOM_INSET }}
                />
                <div className="relative z-10 mx-1 mb-1 flex h-8 items-center justify-between gap-2 rounded-b-md border-t border-border/60 bg-background/70 pl-2.5 pr-4 backdrop-blur-xl">
                  <div className="min-w-0 max-w-[70%]">
                    <span className="block truncate text-xs font-semibold text-foreground">{palette.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {onDuplicatePalette && (
                      <button
                        type="button"
                        data-palette-row-action="true"
                        className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground transition hover:border-border/60 hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
                        data-palette-row-action="true"
                        className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground transition hover:border-border/60 hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
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

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="w-full cursor-pointer rounded-lg border bg-transparent font-semibold"
                onClick={handleAddPalette}
              >
                + New Palette
              </Button>
              <Button
                variant="outline"
                className="w-full cursor-pointer rounded-lg border bg-transparent font-semibold"
                onClick={() => setShowTemplates(true)}
              >
                <LibraryBig className="h-4 w-4" />
                Templates
              </Button>
            </div>
          </>
        )}
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

function getPalettePreviewLayout(
  colorCount: number,
  columns: number,
  options: PalettePreviewLayoutOptions,
): { height: number; rows: number } {
  const safeColumns = Math.max(1, columns)
  const neededRows = Math.ceil(Math.max(1, colorCount) / safeColumns)
  const rows = Math.max(1, Math.min(options.maxRows, neededRows))
  const colorAreaHeight = Math.max(PREVIEW_MIN_COLOR_AREA_HEIGHT, rows * PREVIEW_ROW_HEIGHT + 12)
  const height = Math.max(options.minHeight, Math.min(options.maxHeight, options.bottomInset + colorAreaHeight))

  return { height, rows }
}

function MosaicColorSurface({
  colors,
  columns,
  rows,
  bottomInset = 0,
}: {
  colors: PreviewColor[]
  columns: number
  rows: number
  bottomInset?: number
}) {
  const maxColumns = Math.max(1, columns)
  const maxRows = Math.max(1, rows)
  const visibleTarget = Math.min(Math.max(colors.length, 1), maxColumns * maxRows)
  const safeRows =
    colors.length <= 2
      ? 1
      : colors.length <= Math.min(maxColumns, 8)
        ? 2
        : colors.length <= maxColumns * 2
          ? Math.min(maxRows, 3)
          : colors.length <= maxColumns * 3
            ? Math.min(maxRows, 4)
            : maxRows
  const safeColumns = Math.max(1, Math.min(maxColumns, Math.ceil(visibleTarget / safeRows)))
  const cellCount = safeColumns * safeRows
  const visibleColors: PreviewColor[] =
    colors.length === 0
      ? []
      : colors.length > cellCount
        ? colors.slice(0, cellCount)
        : Array.from({ length: cellCount }, (_, index) => colors[index % colors.length])
  const hiddenCount = Math.max(0, colors.length - visibleColors.length)

  return (
    <div
      className="absolute left-1 right-1 top-1 grid overflow-hidden rounded-t-md bg-muted p-1"
      style={{
        bottom: bottomInset,
        gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${safeRows}, minmax(0, 1fr))`,
        gap: "2px",
      }}
      aria-hidden="true"
    >
      {visibleColors.map((color, index) => {
        const isLastVisible = hiddenCount > 0 && index === visibleColors.length - 1

        return (
          <div
            key={color.id ?? `${color.group ?? "color"}-${color.name ?? ""}-${color.hex}-${index}`}
            className="relative min-h-0 min-w-0 overflow-hidden rounded-[4px]"
            title={`${color.group ? `${color.group} / ` : ""}${color.name || color.hex}`}
            style={{
              backgroundColor: color.hex,
              boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.08)",
            }}
          >
            {isLastVisible && (
              <span className="absolute inset-0 flex items-center justify-center bg-background/75 px-1 text-[10px] font-bold leading-none text-foreground backdrop-blur-md">
                +{hiddenCount}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
