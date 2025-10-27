"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DragHandle } from "@/components/ui/drag-handle"
import { Copy, Pencil, Trash2 } from "lucide-react"
import type React from "react"

import type { ColorWithName } from "@/components/color-manager/types"

type InsertPosition = "before" | "after"

export type ColorCardState = {
  isDragging: boolean
  isDropTarget: boolean
  showSwapTarget: boolean
  highlightHandle: boolean
  highlightActiveEditing: boolean
  showCopySuccess: boolean
  showJustDropped: boolean
  showDeleting: boolean
  isEditingName: boolean
  editingName: string
  hasNameError: boolean
  isEditingHex: boolean
  editingHex: string
  insertPosition: InsertPosition | null
}

type ColorCardProps = {
  color: ColorWithName
  nameInputRef: React.RefObject<HTMLInputElement | null>
  registerCardRef?: (node: HTMLDivElement | null) => void
  showBeforeInsertZone: boolean
  showAfterInsertZone: boolean
  state: ColorCardState
  onNameChange: (value: string) => void
  onNameSave: () => void
  onNameCancel: () => void
  onNameEdit: (mode?: "button" | "doubleClick") => void
  onNameClick: () => void
  onDelete: () => void
  onHexChange: (value: string) => void
  onHexSave: () => void
  onHexCancel: () => void
  onHexEdit: () => void
  onCopyHex: () => void
  onDragStart: (event: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (event: React.DragEvent) => void
  onDragLeave: () => void
  onInsertZoneHover: (position: InsertPosition) => void
  onInsertZoneLeave: () => void
  onCardClick: (event: React.MouseEvent<HTMLDivElement>) => void
  onHandleHover: (hovering: boolean) => void
  onSwatchClick: () => void
}

export function ColorCard({
  color,
  nameInputRef,
  registerCardRef,
  showBeforeInsertZone,
  showAfterInsertZone,
  state,
  onNameChange,
  onNameSave,
  onNameCancel,
  onNameEdit,
  onNameClick,
  onDelete,
  onHexChange,
  onHexSave,
  onHexCancel,
  onHexEdit,
  onCopyHex,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onInsertZoneHover,
  onInsertZoneLeave,
  onCardClick,
  onHandleHover,
  onSwatchClick,
}: ColorCardProps) {
  const {
    isDragging,
    isDropTarget,
    showSwapTarget,
    highlightHandle,
    highlightActiveEditing,
    showCopySuccess,
    showJustDropped,
    showDeleting,
    isEditingName,
    editingName,
    hasNameError,
    isEditingHex,
    editingHex,
  } = state

  const handleRef = (node: HTMLDivElement | null) => {
    registerCardRef?.(node)
  }

  return (
    <div className="relative w-full pb-5" ref={handleRef} data-color-card>
      {showBeforeInsertZone && (
        <div
          className="absolute inset-y-[-12px] left-0 z-20 w-6 -translate-x-full rounded-l-md border-2 border-dashed border-transparent"
          onDragOver={(event) => {
            event.preventDefault()
            onInsertZoneHover("before")
          }}
          onDragEnter={(event) => {
            event.preventDefault()
            onInsertZoneHover("before")
          }}
          onDragLeave={onInsertZoneLeave}
        />
      )}

      {showAfterInsertZone && (
        <div
          className="absolute inset-y-[-12px] right-0 z-20 w-6 translate-x-full rounded-r-md border-2 border-dashed border-transparent"
          onDragOver={(event) => {
            event.preventDefault()
            onInsertZoneHover("after")
          }}
          onDragEnter={(event) => {
            event.preventDefault()
            onInsertZoneHover("after")
          }}
          onDragLeave={onInsertZoneLeave}
        />
      )}

      <div
        className={`group relative flex w-full flex-col items-stretch gap-1.5 overflow-visible rounded-xl bg-white p-2.5 pb-3 transition ${
          highlightActiveEditing ? "border-2 border-dashed border-slate-500" : "border border-transparent"
        } ${isDragging ? "opacity-70 animate-wiggle" : "opacity-100"}`}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move"
          onDragStart(event)
        }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          event.preventDefault()
          onDragOver(event)
        }}
        onDragLeave={onDragLeave}
        onClick={onCardClick}
      >
        {showSwapTarget && isDropTarget && (
          <div className="pointer-events-none absolute inset-0 z-30 rounded-xl border-2 border-dashed border-blue-500" />
        )}
        {showJustDropped && (
          <div className="pointer-events-none absolute inset-0 z-20 rounded-xl border border-blue-500/70" />
        )}
        <div
          className={`flex w-full flex-col gap-1.5 ${
            showDeleting ? "animate-pop-burst pointer-events-none" : ""
          }`}
        >
          <div className="flex w-full items-center justify-between px-0.5 text-[11px] font-semibold text-foreground">
            {isEditingName ? (
              <Input
                ref={nameInputRef}
                value={editingName}
                onChange={(event) => onNameChange(event.target.value)}
                onBlur={onNameCancel}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onNameSave()
                  if (event.key === "Escape") onNameCancel()
                }}
                className={`h-6 flex-1 border border-black/30 bg-white px-2 font-mono text-[11px] uppercase tracking-tight ${
                  hasNameError ? "border-red-500 text-red-500 focus-visible:ring-red-500" : ""
                }`}
                placeholder="Custom name"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onNameClick()
                }}
                className="truncate text-left font-mono text-[11px] uppercase tracking-tight text-foreground hover:text-slate-600"
              >
                {(color.name || color.hex).toUpperCase()}
              </button>
            )}
            <div className="flex items-center gap-1 text-muted-foreground">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md border border-transparent text-muted-foreground hover:border-slate-300"
                onClick={(event) => {
                  event.stopPropagation()
                  onNameEdit("button")
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md border border-transparent text-muted-foreground hover:border-slate-300"
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete()
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="w-full overflow-hidden rounded-lg border border-black bg-white shadow-sm">
            <div
              className="h-24 w-full border-b border-black"
              style={{ backgroundColor: color.hex }}
              onClick={(event) => {
                event.stopPropagation()
                onSwatchClick()
              }}
            />

            <div className="flex items-center justify-between px-2.5 pb-1.5 pt-2.5">
              {isEditingHex ? (
                <Input
                  value={editingHex}
                  onChange={(event) => onHexChange(event.target.value)}
                  onBlur={onHexCancel}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onHexSave()
                    if (event.key === "Escape") onHexCancel()
                  }}
                  className="h-7 w-24 border border-black/30 text-center font-mono text-xs uppercase"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onHexEdit()
                  }}
                  className="font-mono text-sm uppercase tracking-wide text-foreground"
                >
                  {color.hex.toUpperCase()}
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md border border-transparent text-muted-foreground hover:border-slate-300"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (isEditingHex) {
                      onHexSave()
                    } else {
                      onCopyHex()
                    }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                {showCopySuccess && <span className="text-[10px] font-semibold text-green-600">Copied!</span>}
              </div>
            </div>
          </div>
        </div>
        <div className={`flex justify-center ${showDeleting ? "opacity-0 pointer-events-none" : ""}`}>
          <DragHandle
            variant="inline"
            highlighted={highlightHandle}
            draggable
            className={`${isDragging ? "cursor-grabbing" : ""}`}
            onMouseEnter={() => onHandleHover(true)}
            onMouseLeave={() => onHandleHover(false)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move"
              onDragStart(event)
            }}
            onDragEnd={onDragEnd}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      </div>
    </div>
  )
}
