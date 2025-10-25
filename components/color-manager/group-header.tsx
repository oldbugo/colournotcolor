"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GripVertical, Lock, Pencil } from "lucide-react"
import type React from "react"

type GroupHeaderProps = {
  groupName: string
  groupNameTextClass: string
  isEditing: boolean
  editingValue: string
  isUngrouped: boolean
  onChangeEditingValue: (value: string) => void
  onSaveEditingValue: () => void
  onCancelEditing: () => void
  onStartEditing: () => void
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
}

export function GroupHeader({
  groupName,
  groupNameTextClass,
  isEditing,
  editingValue,
  isUngrouped,
  onChangeEditingValue,
  onSaveEditingValue,
  onCancelEditing,
  onStartEditing,
  onDragStart,
  onDragEnd,
}: GroupHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex items-center justify-center rounded-md border border-border bg-background p-2 ${
          isUngrouped ? "opacity-50" : "cursor-grab active:cursor-grabbing"
        }`}
        draggable={!isUngrouped}
        onDragStart={(event) => {
          if (isUngrouped) return
          onDragStart(event)
        }}
        onDragEnd={onDragEnd}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {isEditing ? (
        <Input
          value={editingValue}
          onChange={(event) => onChangeEditingValue(event.target.value)}
          onBlur={onCancelEditing}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSaveEditingValue()
            if (event.key === "Escape") onCancelEditing()
          }}
          className={`h-auto w-64 border-2 ${groupNameTextClass}`}
          autoFocus
        />
      ) : (
        <div className="flex items-center gap-2">
          <h3 className={`${groupNameTextClass} ${isUngrouped ? "text-muted-foreground" : ""}`}>{groupName}</h3>
          {isUngrouped ? (
            <Lock className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(event) => {
                event.stopPropagation()
                onStartEditing()
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
