"use client"

import type React from "react"

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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

import { getApcaMarkerPosition } from "./apca-helpers"

/**
 * Default card size used by the matrix. Kept in sync with CARD_SIZE in
 * components/contrast-grid.tsx; if you change it there, change it here.
 */
const CARD_SIZE = 132

/** Half-gap used for the dashed focus ring around a selected cell. */
const BORDER_GAP = 8

/** Filter menu resize-handle metrics. */
const FILTER_MENU_RESIZE_OUTLINE_OFFSET = 12
const FILTER_MENU_RESIZE_ARC_RADIUS_ADJUST = -6
const FILTER_MENU_RESIZE_ARC_SIZE = 64
const FILTER_MENU_RESIZE_ARC_INSET = 64

// --- SwatchTile ----------------------------------------------------------------

type SwatchTileProps = {
  hexColor: string
  label: string
  size?: number
  labelPlacement?: "bottom" | "center"
  className?: string
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
}

export const SwatchTile = ({
  hexColor,
  label,
  size = CARD_SIZE,
  labelPlacement = "bottom",
  className,
  onClick,
}: SwatchTileProps) => {
  const isCentered = labelPlacement === "center"
  const baseClassName = `flex flex-col items-center border border-border transition-all cursor-pointer hover:opacity-90 rounded-md ${
    isCentered ? "justify-center" : "justify-end pb-0"
  }`
  const combinedClassName = className ? `${baseClassName} ${className}` : baseClassName

  return (
    <div
      className={combinedClassName}
      style={{ height: `${size}px`, width: `${size}px`, backgroundColor: hexColor }}
      onClick={onClick}
    >
      <div className="w-full py-2 px-2">
        <div className="rounded bg-white font-mono text-black text-center px-2 my-0 text-sm rounded-sm border py-1 font-light leading-6 break-words whitespace-normal min-h-[2.5rem] flex items-center justify-center">
          <span className="block w-full break-words whitespace-normal">{label}</span>
        </div>
      </div>
    </div>
  )
}

// --- Small static accents -----------------------------------------------------

export const FocusIndicator = ({ inset = BORDER_GAP }: { inset?: number }) => (
  <div
    className="absolute border-2 border-dashed border-gray-400 rounded-lg pointer-events-none z-20"
    style={{ inset: `-${inset}px` }}
  />
)

export const BubbleIndicator = ({ left }: { left: number }) => (
  <div
    className="pointer-events-none absolute -bottom-4 flex -translate-x-1/2 flex-col items-center"
    style={{ left: `${left}%` }}
  >
    <div className="h-2 w-px bg-border/80" />
    <div className="h-3 w-3 rotate-45 rounded-[2px] border border-border bg-background shadow-[0_2px_4px_rgba(0,0,0,0.16)]" />
  </div>
)

// --- ResizeCornerHandle (filter menu) ----------------------------------------

type ResizeCornerHandleProps = {
  position: "left" | "right"
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
}

export const ResizeCornerHandle = ({ position, onPointerDown }: ResizeCornerHandleProps) => {
  const isLeft = position === "left"
  const outlineStyle: React.CSSProperties = {
    bottom: -7,
    width: FILTER_MENU_RESIZE_ARC_SIZE,
    height: FILTER_MENU_RESIZE_ARC_SIZE,
    border: "3px solid currentColor",
    borderRadius: `calc(var(--radius) + ${FILTER_MENU_RESIZE_OUTLINE_OFFSET + FILTER_MENU_RESIZE_ARC_RADIUS_ADJUST}px)`,
    clipPath: isLeft
      ? `inset(${FILTER_MENU_RESIZE_ARC_INSET}% ${FILTER_MENU_RESIZE_ARC_INSET}% 0 0)`
      : `inset(${FILTER_MENU_RESIZE_ARC_INSET}% 0 0 ${FILTER_MENU_RESIZE_ARC_INSET}%)`,
  }
  if (isLeft) {
    outlineStyle.left = -7
  } else {
    outlineStyle.right = -7
  }
  return (
    <div
      className={`group absolute -bottom-1 ${isLeft ? "-left-1" : "-right-1"} h-12 w-12 text-foreground/50 hover:text-foreground/90 z-10`}
      style={{ cursor: isLeft ? "nesw-resize" : "nwse-resize" }}
      onPointerDown={onPointerDown}
      role="separator"
    >
      <div
        className="pointer-events-none absolute opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        style={outlineStyle}
      />
    </div>
  )
}

// --- ApcaRangeIndicator -------------------------------------------------------

type ApcaRangeIndicatorProps = {
  markers: Array<{ value: number; label: string }>
  gradient: string
}

export const ApcaRangeIndicator = ({ markers, gradient }: ApcaRangeIndicatorProps) => {
  if (markers.length === 0) {
    return null
  }

  const sortedMarkers = [...markers].sort((a, b) => a.value - b.value)

  return (
    <div className="w-full">
      <div className="relative h-3 w-full">
        <div
          className="absolute inset-0 rounded-full border border-border shadow-sm"
          style={{ background: gradient }}
        />
        {sortedMarkers.map((marker) => {
          const left = getApcaMarkerPosition(marker.value)
          return (
            <div
              key={`${marker.label}-${marker.value}`}
              className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background shadow-sm"
              style={{ left: `${left}%` }}
            />
          )
        })}
      </div>
      <div className="relative mt-4 h-6 w-full text-base font-semibold text-foreground text-center">
        {sortedMarkers.map((marker) => {
          const left = getApcaMarkerPosition(marker.value)
          return (
            <span
              key={`${marker.label}-label-${marker.value}`}
              className="absolute -translate-x-1/2"
              style={{ left: `${left}%` }}
            >
              {marker.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// --- ConfirmActionButton (filter menu) ----------------------------------------

type ConfirmActionButtonProps = {
  variant: "clear" | "select"
  description: string
  onConfirm: () => void
}

export const ConfirmActionButton = ({ variant, description, onConfirm }: ConfirmActionButtonProps) => {
  const isClear = variant === "clear"
  const buttonText = isClear ? "Clear all" : "Select all"
  const triggerVariant = isClear ? "blackOutline" : "black"

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={triggerVariant} size="sm" className="flex-1">
          {buttonText}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Confirm ${buttonText.toLowerCase()}`}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel asChild>
            <Button variant="blackOutline" size="sm">
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="black"
              size="sm"
              onClick={() => {
                onConfirm()
              }}
            >
              {buttonText}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
