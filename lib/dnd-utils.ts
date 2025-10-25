import type { ClientRect, Collision, CollisionDetection, DroppableContainer } from "@dnd-kit/core"
import { pointerWithin, rectIntersection } from "@dnd-kit/core"

export type DropMode = "swap" | "before" | "after"

export type CardSlotData = {
  type: "slot"
  slotType: "card"
  groupId: string
  insertIndex: number
  targetId: string | null
  dropMode: DropMode
}

export type GridSlotType = "foreground" | "background"

export type GridSlotData = {
  type: "slot"
  slotType: GridSlotType
  insertIndex: number
  targetId: string | null
  dropMode: DropMode
}

export type SlotData = CardSlotData | GridSlotData

export type DroppableData =
  | SlotData
  | { type: "card"; groupId: string; index: number }
  | { type: "group"; groupId: string }
  | { type: "foreground"; index: number }
  | { type: "background"; index: number }
  | { type: "special"; action: "new-group" | "delete" }

type DroppableKind = "special" | "slot" | "item" | "group" | "unknown"

const DROPPABLE_PRIORITY: Record<DroppableKind, number> = {
  special: 0,
  slot: 1,
  item: 2,
  group: 3,
  unknown: 4,
}

type RectLike = ClientRect | { left: number; top: number; width: number; height: number }

function getDroppableKind(container: DroppableContainer | undefined): DroppableKind {
  if (!container?.data?.current) return "unknown"
  const type = (container.data.current as { type?: string }).type
  if (type === "special") return "special"
  if (type === "slot") return "slot"
  if (type === "group") return "group"
  if (type === "card" || type === "foreground" || type === "background") return "item"
  return "unknown"
}

function distanceBetweenRectCenters(a: RectLike, b: RectLike): number {
  const ax = a.left + a.width / 2
  const ay = a.top + a.height / 2
  const bx = b.left + b.width / 2
  const by = b.top + b.height / 2
  return Math.hypot(ax - bx, ay - by)
}

function prioritizeCollisions(
  collisions: Collision[],
  droppableContainers: DroppableContainer[],
  collisionRect: RectLike | null,
): Collision[] {
  if (collisions.length === 0) return collisions

  return collisions
    .map((collision) => {
      const container = droppableContainers.find((entry) => entry.id === collision.id)
      const kind = getDroppableKind(container)
      const priority = DROPPABLE_PRIORITY[kind]
      const rect = (container?.rect?.current ?? null) as RectLike | null
      const distance =
        collisionRect && rect ? distanceBetweenRectCenters(collisionRect, rect) : 0
      return { collision, priority, distance }
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.distance - b.distance
    })
    .map((entry) => entry.collision)
}

export const priorityCollisionDetection: CollisionDetection = (args) => {
  const collisionRect = (args.collisionRect ?? null) as RectLike | null
  const containers = Array.from(args.droppableContainers.values())

  const pointerCollisions = pointerWithin(args)
  const prioritizedPointer = prioritizeCollisions(pointerCollisions, containers, collisionRect)
  if (prioritizedPointer.length > 0) {
    return prioritizedPointer
  }

  const rectCollisions = rectIntersection(args)
  return prioritizeCollisions(rectCollisions, containers, collisionRect)
}

export function isCardSlotData(data: unknown): data is CardSlotData {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: string }).type === "slot" &&
    (data as { slotType?: string }).slotType === "card"
  )
}

export function isGridSlotData(data: unknown, slotType?: GridSlotType): data is GridSlotData {
  if (
    typeof data !== "object" ||
    data === null ||
    (data as { type?: string }).type !== "slot"
  ) {
    return false
  }
  const currentSlotType = (data as { slotType?: string }).slotType
  if (slotType) {
    return currentSlotType === slotType
  }
  return currentSlotType === "foreground" || currentSlotType === "background"
}

export const cardSlotId = (groupId: string, anchorId: string, position: "before" | "after") =>
  `slot-card:${groupId}:${anchorId}:${position}`

export const foregroundSlotId = (anchorId: string, position: "before" | "after") =>
  `slot-foreground:${anchorId}:${position}`

export const backgroundSlotId = (anchorId: string, position: "before" | "after") =>
  `slot-background:${anchorId}:${position}`
