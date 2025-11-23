"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Settings, Copy, Trash2, Pencil } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { useState } from "react"
import { Switch } from "@/components/ui/switch"
import type { ContrastStandard } from "@/lib/contrast-utils"

type HeaderProps = {
  onClearCache?: () => void
  paletteName?: string
  onUpdatePaletteName?: (name: string) => void
  onDuplicatePalette?: () => void
  onDeletePalette?: () => void
  collapseGroupsDuringGroupDrag?: boolean
  onCollapseGroupsDuringDragChange?: (value: boolean) => void
  contrastStandard: ContrastStandard
  onContrastStandardChange: (standard: ContrastStandard) => void
}

export function Header({
  onClearCache,
  paletteName,
  onUpdatePaletteName,
  onDuplicatePalette,
  onDeletePalette,
  collapseGroupsDuringGroupDrag = false,
  onCollapseGroupsDuringDragChange,
  contrastStandard: _contrastStandard,
  onContrastStandardChange: _onContrastStandardChange,
}: HeaderProps) {
  void _contrastStandard
  void _onContrastStandardChange
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState(paletteName || "")
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const handleClearCache = () => {
    setShowClearDialog(false)
    onClearCache?.()
  }

  const handleStartEditingName = () => {
    setEditedName(paletteName || "")
    setIsEditingName(true)
  }

  const handleSaveName = () => {
    onUpdatePaletteName?.(editedName)
    setIsEditingName(false)
  }

  const handleDelete = () => {
    setShowDeleteDialog(false)
    onDeletePalette?.()
  }

  const shouldShowPaletteSection = !!paletteName

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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDuplicatePalette}
                  className="cursor-pointer font-semibold bg-background rounded-md border h-8"
                >
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Duplicate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  className="cursor-pointer rounded-md border font-semibold h-8"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            )}
        </div>
        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="cursor-pointer">
                <Settings className="h-5 w-5" />
              </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                <DropdownMenuItem
                  onSelect={(event) => event.preventDefault()}
                  className="cursor-pointer focus:bg-accent/30 focus:text-foreground"
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">Collapse groups while dragging</span>
                    <Switch
                      checked={collapseGroupsDuringGroupDrag}
                      onCheckedChange={(checked) => onCollapseGroupsDuringDragChange?.(checked)}
                      aria-label="Collapse groups while dragging"
                    />
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border/60" />
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

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Palette</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{paletteName}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-black hover:bg-black/90 text-white" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
