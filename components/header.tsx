"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Settings, Copy, Pencil, Info, Palette } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import type { ContrastStandard } from "@/lib/contrast-utils"
import type { ColorSwatch } from "@/types/palette"
import { createSwatch } from "@/lib/color-utils"
import { cn } from "@/lib/utils"
import { CARD_CONTROL_RADII } from "@/lib/design-tokens"

type HeaderProps = {
  onClearCache?: () => void
  paletteName?: string
  paletteColors?: ColorSwatch[]
  onUpdatePaletteName?: (name: string) => void
  onImportPalette?: (palette: { name: string; colors: ColorSwatch[] }) => void
  contrastStandard: ContrastStandard
  onContrastStandardChange: (standard: ContrastStandard) => void
  paletteManagerDropdownContent?: ReactNode | ((controls: { close: () => void }) => ReactNode)
}

const HEADER_ICON_TRIGGER_CLASSNAME =
  "size-10 border border-border bg-muted/20 text-foreground shadow-xs transition-all duration-150 hover:border-primary/40 hover:bg-muted/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 data-[state=open]:border-primary/60 data-[state=open]:bg-primary/5 data-[state=open]:text-primary data-[state=open]:shadow-sm"

export function Header({
  onClearCache,
  paletteName,
  paletteColors,
  onUpdatePaletteName,
  onImportPalette,
  contrastStandard: _contrastStandard,
  onContrastStandardChange: _onContrastStandardChange,
  paletteManagerDropdownContent,
}: HeaderProps) {
  void _contrastStandard
  void _onContrastStandardChange
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState(paletteName || "")
  const [showImportExportDialog, setShowImportExportDialog] = useState(false)
  const [isPaletteMenuOpen, setIsPaletteMenuOpen] = useState(false)
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false)
  const [transferMode, setTransferMode] = useState<"export" | "import">("export")
  const [importText, setImportText] = useState("")
  const [importError, setImportError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null)
  const toastTimeoutRef = useRef<number | null>(null)
  const importTooltipId = useId()

  const exportPayload = useMemo(() => {
    const colors = paletteColors ?? []
    const payload = {
      name: paletteName ?? "Untitled",
      colors: colors.map((swatch) => ({
        hex: swatch.hex,
        name: swatch.name,
        group: swatch.group,
      })),
    }
    return JSON.stringify(payload, null, 2)
  }, [paletteColors, paletteName])

  const handleClearCache = () => {
    setShowClearDialog(false)
    onClearCache?.()
  }

  const openImportExportDialog = () => {
    setTransferMode("export")
    setImportText("")
    setImportError(null)
    setShowImportExportDialog(true)
  }

  const handleImportExportOpenChange = (open: boolean) => {
    setShowImportExportDialog(open)
    if (!open) {
      setImportText("")
      setImportError(null)
    }
  }

  const handleCopyExport = async () => {
    if (!exportPayload) return
    try {
      await navigator.clipboard.writeText(exportPayload)
      showToast("Export JSON copied to clipboard.", "success")
    } catch {
      showToast("Copy failed. Please try again.", "error")
    }
  }

  const handlePasteImport = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        showToast("Clipboard is empty.", "error")
        return
      }
      setImportText(text)
      setImportError(null)
      showToast("Pasted from clipboard.", "success")
    } catch {
      showToast("Paste failed. Please check clipboard permissions.", "error")
    }
  }

  const handleStartEditingName = () => {
    setEditedName(paletteName || "")
    setIsEditingName(true)
  }

  const handleSaveName = () => {
    onUpdatePaletteName?.(editedName)
    setIsEditingName(false)
  }

  const handleImport = () => {
    if (!onImportPalette) {
      setImportError("Import is not available right now.")
      return
    }
    const trimmed = importText.trim()
    if (!trimmed) {
      setImportError("Paste JSON to import.")
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      setImportError("Invalid JSON. Check the formatting and try again.")
      return
    }
    if (!parsed || typeof parsed !== "object") {
      setImportError("Import data should be a JSON object.")
      return
    }
    const data = parsed as Record<string, unknown>
    const nestedPalette =
      data.palette && typeof data.palette === "object" ? (data.palette as Record<string, unknown>) : null
    const colorSource = Array.isArray(data.colors)
      ? data.colors
      : nestedPalette && Array.isArray(nestedPalette.colors)
        ? nestedPalette.colors
        : null
    if (!colorSource) {
      setImportError("Import data must include a colors array.")
      return
    }
    const rawName =
      typeof data.name === "string"
        ? data.name
        : nestedPalette && typeof nestedPalette.name === "string"
          ? nestedPalette.name
          : paletteName ?? "Untitled"
    const nextName = rawName.trim() || paletteName || "Untitled"
    const nextColors = colorSource.map((entry) => {
      if (typeof entry === "string") {
        return createSwatch({ hex: entry })
      }
      if (!entry || typeof entry !== "object") {
        return createSwatch({ hex: "#000000" })
      }
      const color = entry as { hex?: unknown; name?: unknown; group?: unknown }
      const hex = typeof color.hex === "string" ? color.hex : "#000000"
      const name = typeof color.name === "string" ? color.name : ""
      const group = typeof color.group === "string" ? color.group : null
      return createSwatch({ hex, name, group })
    })

    onImportPalette({ name: nextName, colors: nextColors })
    setShowImportExportDialog(false)
    setImportText("")
    setImportError(null)
    showToast(`Imported "${nextName}" as a new palette.`, "success")
  }

  const showToast = useCallback((message: string, tone: "success" | "error" = "success") => {
    setToast({ message, tone })
  }, [])

  useEffect(() => {
    if (!toast) {
      return
    }
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current)
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimeoutRef.current = null
    }, 2600)
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current)
        toastTimeoutRef.current = null
      }
    }
  }, [toast])

  const shouldShowPaletteSection = !!paletteName
  const closePaletteMenu = useCallback(() => setIsPaletteMenuOpen(false), [])
  const resolvedPaletteManagerDropdownContent =
    typeof paletteManagerDropdownContent === "function"
      ? paletteManagerDropdownContent({ close: closePaletteMenu })
      : paletteManagerDropdownContent

  return (
    <>
      <header className="border-border px-6 py-4 border-b-2 bg-secondary">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold">
              colour<span className="font-normal">not</span>color
            </h1>
            {shouldShowPaletteSection && (
              <div className="flex items-center gap-2 border-l-2 border-border pl-6">
                {isEditingName ? (
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onBlur={handleSaveName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName()
                      if (e.key === "Escape") {
                        setEditedName(paletteName)
                        setIsEditingName(false)
                      }
                    }}
                    className="text-lg font-semibold h-auto border-2 border-input rounded-md px-2 py-1 focus-visible:ring-2 focus-visible:ring-ring w-64"
                    autoFocus
                  />
                ) : (
                  <>
                    <h2 className="font-semibold text-lg">{paletteName}</h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleStartEditingName}
                      className="h-7 w-7 cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <div className="flex items-center gap-1.5">
                  {resolvedPaletteManagerDropdownContent && (
                    <DropdownMenu modal={false} open={isPaletteMenuOpen} onOpenChange={setIsPaletteMenuOpen}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon-lg"
                          className={HEADER_ICON_TRIGGER_CLASSNAME}
                          aria-label="Open palette manager"
                          style={{
                            borderRadius: isPaletteMenuOpen ? CARD_CONTROL_RADII.elevated : CARD_CONTROL_RADII.pill,
                          }}
                        >
                          <Palette className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" sideOffset={10} className="w-[min(92vw,960px)] p-0">
                        <div data-palette-manager-dropdown className="max-h-[75vh] overflow-auto bg-muted">
                          {resolvedPaletteManagerDropdownContent}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <DropdownMenu open={isSettingsMenuOpen} onOpenChange={setIsSettingsMenuOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon-lg"
                        className={HEADER_ICON_TRIGGER_CLASSNAME}
                        aria-label="Open settings"
                        style={{
                          borderRadius: isSettingsMenuOpen ? CARD_CONTROL_RADII.elevated : CARD_CONTROL_RADII.pill,
                        }}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-[220px]">
                      <DropdownMenuItem
                        onSelect={openImportExportDialog}
                        className="cursor-pointer focus:bg-accent/30 focus:text-foreground"
                      >
                        Import/Export
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setShowClearDialog(true)}
                        className="cursor-pointer text-red-600 focus:bg-accent/30 focus:text-red-600"
                      >
                        Clear Cache
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}
        </div>
        </div>
      </header>

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Cache</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all saved palettes, names, and preferences. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearCache} className="bg-red-600 hover:bg-red-700">
              Clear Cache
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showImportExportDialog} onOpenChange={handleImportExportOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Import / Export</DialogTitle>
            <DialogDescription>Move your current palette in and out of the app as JSON.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="inline-flex rounded-full border border-border bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setTransferMode("export")
                    setImportError(null)
                  }}
                  className={cn(
                    "cursor-pointer px-3 py-0.5 text-xs font-semibold uppercase tracking-wide transition rounded-full",
                    transferMode === "export"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTransferMode("import")
                    setImportError(null)
                  }}
                  className={cn(
                    "cursor-pointer px-3 py-0.5 text-xs font-semibold uppercase tracking-wide transition rounded-full",
                    transferMode === "import"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Import
                </button>
              </div>
              <div className="relative group/tooltip">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  aria-describedby={importTooltipId}
                  aria-label="Import and export help"
                >
                  <Info className="h-4 w-4" />
                </button>
                <div
                  id={importTooltipId}
                  role="tooltip"
                  className="pointer-events-none invisible absolute right-0 top-full z-10 mt-2 w-64 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium leading-4 text-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover/tooltip:visible group-hover/tooltip:opacity-100 group-focus-within/tooltip:visible group-focus-within/tooltip:opacity-100"
                >
                  Export creates JSON for the active palette. Save it and paste it back here to import later.
                </div>
              </div>
            </div>

            {transferMode === "export" ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Export JSON</label>
                  <textarea
                    value={exportPayload}
                    readOnly
                    rows={8}
                    className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => handleImportExportOpenChange(false)} className="cursor-pointer">
                    Close
                  </Button>
                  <Button onClick={handleCopyExport} className="cursor-pointer">
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Import JSON</label>
                  <textarea
                    value={importText}
                    onChange={(event) => {
                      setImportText(event.target.value)
                      if (importError) {
                        setImportError(null)
                      }
                    }}
                    rows={8}
                    placeholder='{"name":"Palette name","colors":[{"hex":"#000000","name":"Black","group":"Neutrals"}]}'
                    className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  />
                  {importError && <p className="text-sm text-red-600">{importError}</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => handleImportExportOpenChange(false)} className="cursor-pointer">
                    Cancel
                  </Button>
                  <Button onClick={handlePasteImport} className="cursor-pointer" variant="outline">
                    Paste
                  </Button>
                  <Button onClick={handleImport} disabled={!importText.trim()} className="cursor-pointer">
                    Import
                  </Button>
                </DialogFooter>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed left-1/2 top-6 z-[70] -translate-x-1/2 rounded-md border px-4 py-2 text-sm font-medium shadow-lg pointer-events-none",
            toast.tone === "success"
              ? "border-emerald-600/40 bg-emerald-600 text-white"
              : "border-red-600/40 bg-red-600 text-white",
          )}
        >
          {toast.message}
        </div>
      )}
    </>
  )
}
