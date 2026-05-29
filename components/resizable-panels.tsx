"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import {
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  GripVertical,
  Minimize2,
  Pipette,
  SwatchBook,
  type LucideIcon,
} from "lucide-react"
import {
  applySplitResizeSession,
  collapsePanelInWorkspace,
  createDefaultPanelWorkspaceState,
  createSplitResizeSession,
  getPanelLayoutMinSize,
  getPanelIds,
  getSplitRatioAtPath,
  getSplitResizeGroupPath,
  isPanelId,
  movePanelInWorkspace,
  movePanelToAdjacentPairSide,
  movePanelToSplitGap,
  movePanelToLayoutPathSide,
  movePanelToWorkspaceEdge,
  removePanelFromLayout,
  resizeSplitLayoutFromSession,
  resizeSplitSession,
  restorePanelInWorkspace,
  swapPanelsInWorkspace,
  updateSplitRatio,
  type DropSide,
  type PanelId,
  type PanelLayoutNode,
  type PanelWorkspaceState,
  type SplitDirection,
  type SplitPath,
  type WorkspaceEdgeSide,
} from "@/lib/panel-workspace"
import { storage } from "@/lib/storage-utils"
import { cn } from "@/lib/utils"

type PanelHeaderProps = {
  panelId: PanelId
  title: string
  onCollapse: (panelId: PanelId) => void
  onPointerDragStart: (panelId: PanelId, source: PanelDragSource, event: ReactPointerEvent<HTMLElement>) => void
}

type ResizablePanelsProps = {
  panel1: ReactNode
  panel2: ReactNode
  panel3: ReactNode
  defaultWidths?: [number, number, number]
  panel1Title?: string
  panel2Title?: string
  panel3Title?: string
}

type PanelConfig = {
  title: string
  content: ReactNode
  icon: LucideIcon
}

type PanelDragSource = "layout" | "dock"
type PanelConfigs = Record<PanelId, PanelConfig>
type PanelDragState = {
  panelId: PanelId
  source: PanelDragSource
}
type PanelCursorPreviewState = PanelDragState & {
  title: string
  x: number
  y: number
}
type PendingPanelPointerDrag = PanelDragState & {
  title: string
  pointerId: number
  startX: number
  startY: number
  started: boolean
  sourceElement: HTMLElement
}
type ActivePanelDrop =
  | {
      type: "swap"
      targetId: PanelId
    }
  | {
      type: "gap"
      target: SplitGapTarget
    }
  | {
      type: "panel-slot"
      target: PanelSlotTarget
    }
  | {
      type: "group-slot"
      target: SplitGroupSlotTarget
    }
  | {
      type: "pair-slot"
      target: AdjacentPairSlotTarget
    }
  | {
      type: "edge"
      side: WorkspaceEdgeSide
    }
  | {
      type: "workspace"
    }

type PanelSlotSide = Extract<DropSide, "top" | "bottom">
type PanelSlotTarget = {
  targetId: PanelId
  side: PanelSlotSide
}

type SplitGroupSlotTarget = {
  pathKey: string
  path: SplitPath
  side: DropSide
}

type AdjacentPairSlotTarget = {
  beforeId: PanelId
  afterId: PanelId
  side: DropSide
  rect: MeasuredRect
}

type SplitGapTarget = {
  pathKey: string
  direction: SplitDirection
  beforeId: PanelId | null
  afterId: PanelId | null
}

type DragPoint = {
  clientX: number
  clientY: number
}

type ResolvedPointDrop = ActivePanelDrop | { type: "dock" } | null
type MeasuredRect = {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}
type DragTargetGeometry = {
  panels: Array<{
    panelId: PanelId
    rect: MeasuredRect
    centerX: number
    centerY: number
  }>
  gaps: Array<{
    target: SplitGapTarget
    rect: MeasuredRect
  }>
  groups: Array<{
    pathKey: string
    path: SplitPath
    rect: MeasuredRect
    panelIds: PanelId[]
  }>
  edges: Array<{
    side: WorkspaceEdgeSide
    rect: MeasuredRect
  }>
}

const SPLITTER_SIZE_PX = 12
const MIN_PANEL_WIDTH_PX = 280
const MIN_PANEL_HEIGHT_PX = 210
const KEYBOARD_RESIZE_STEP = 0.035
const KEYBOARD_RESIZE_STEP_MIN_PX = 28
const PANEL_POINTER_DRAG_START_PX = 4
const PANEL_PREVIEW_ANIMATION_MS = 125
const PANEL_PREVIEW_EASING = "cubic-bezier(0.2, 0.9, 0.2, 1)"
const PANEL_DRAG_PREVIEW_OFFSET_X = 14
const PANEL_DRAG_PREVIEW_OFFSET_Y = 16
const PANEL_SIMPLE_WORKSPACE_FADE_MS = 110
const PANEL_GAP_CROSS_AXIS_MARGIN_PX = 32
const PANEL_GAP_AXIS_ZONE_PX = 96
const PANEL_GAP_CENTER_BIAS_PX = 8
const PANEL_PHYSICAL_GAP_AXIS_MARGIN_PX = 44
const PANEL_PHYSICAL_GAP_CROSS_AXIS_MARGIN_PX = 16
const PANEL_PHYSICAL_GAP_END_GUARD_PX = 56
const PANEL_GAP_ENDPOINT_AXIS_MARGIN_PX = 44
const PANEL_GAP_ENDPOINT_ZONE_PX = 168
const PANEL_SLOT_EDGE_ZONE_PX = 144
const PANEL_GROUP_SLOT_EDGE_ZONE_PX = 104
const PANEL_GROUP_SLOT_CROSS_AXIS_MARGIN_PX = 44
const PANEL_EDGE_DROP_ZONE_PX = 96
const PANEL_EDGE_GAP_PREVIEW_PX = 44
const PANEL_PAIR_SLOT_PREVIEW_END_INSET_PX = 44
const PANEL_DROP_TARGET_DWELL_MS = 110
const PANEL_DROP_TARGET_SWITCH_COOLDOWN_MS = 90
const PANEL_DOCK_TARGET_DWELL_MS = 60
const DROP_SIDES: DropSide[] = ["left", "right", "top", "bottom"]

export function ResizablePanels({
  panel1,
  panel2,
  panel3,
  panel1Title = "Palette Manager",
  panel2Title = "Colour Manager",
  panel3Title = "Contrast Matrix",
}: ResizablePanelsProps) {
  const panelConfigs = useMemo<PanelConfigs>(
    () => ({
      panel1: {
        title: panel1Title,
        content: panel1,
        icon: Pipette,
      },
      panel2: {
        title: panel2Title,
        content: panel2,
        icon: SwatchBook,
      },
      panel3: {
        title: panel3Title,
        content: panel3,
        icon: Grid3X3,
      },
    }),
    [panel1, panel1Title, panel2, panel2Title, panel3, panel3Title],
  )

  const [workspace, setWorkspace] = useState<PanelWorkspaceState>(() => createDefaultPanelWorkspaceState())
  const [layoutHydrated, setLayoutHydrated] = useState(false)
  const [dragState, setDragState] = useState<PanelDragState | null>(null)
  const [dragPreview, setDragPreview] = useState<PanelCursorPreviewState | null>(null)
  const [activeDrop, setActiveDrop] = useState<ActivePanelDrop | null>(null)
  const [isDockActive, setIsDockActive] = useState(false)
  const [isDockExpanded, setIsDockExpanded] = useState(true)
  const [resizingPathKey, setResizingPathKey] = useState<string | null>(null)
  const workspaceRef = useRef(workspace)
  const dragStateRef = useRef<PanelDragState | null>(null)
  const previewPanelRectsRef = useRef<Map<PanelId, DOMRect> | null>(null)
  const dropCommittedRef = useRef(false)
  const activeDropRef = useRef<ActivePanelDrop | null>(null)
  const isDockActiveRef = useRef(false)
  const pendingDropTargetRef = useRef<{ key: string; target: ResolvedPointDrop; startedAt: number } | null>(null)
  const dropTargetTimeoutRef = useRef<number | null>(null)
  const lastDropTargetChangeAtRef = useRef(0)
  const dragTargetGeometryRef = useRef<DragTargetGeometry | null>(null)
  const dragPreviewNodeRef = useRef<HTMLDivElement | null>(null)
  const dragPreviewPointRef = useRef<{ x: number; y: number } | null>(null)
  const pendingPanelPointerDragRef = useRef<PendingPanelPointerDrag | null>(null)
  const pointerDragCleanupRef = useRef<(() => void) | null>(null)
  const suppressNextDockClickRef = useRef(false)

  const previewWorkspace = useMemo(() => {
    if (!dragState) {
      return workspace
    }

    if (dragState.source === "layout" && isDockActive) {
      return {
        ...workspace,
        layout: removePanelFromLayout(workspace.layout, dragState.panelId),
      }
    }

    return workspace
  }, [dragState, isDockActive, workspace])

  useEffect(() => {
    workspaceRef.current = workspace
  }, [workspace])

  useEffect(() => {
    dragStateRef.current = dragState
  }, [dragState])

  useEffect(() => {
    activeDropRef.current = activeDrop
  }, [activeDrop])

  useEffect(() => {
    isDockActiveRef.current = isDockActive
  }, [isDockActive])

  useLayoutEffect(() => {
    if (!dragState) {
      previewPanelRectsRef.current = null
      return
    }

    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-tool-panel]"))
    const nextRects = new Map<PanelId, DOMRect>()
    nodes.forEach((node) => {
      const panelId = node.dataset.toolPanel
      if (isPanelId(panelId)) {
        nextRects.set(panelId, node.getBoundingClientRect())
      }
    })

    const previousRects = previewPanelRectsRef.current
    if (previousRects) {
      nodes.forEach((node) => {
        const panelId = node.dataset.toolPanel
        if (!isPanelId(panelId)) {
          return
        }
        const previous = previousRects.get(panelId)
        const next = nextRects.get(panelId)
        if (!previous || !next) {
          return
        }

        const deltaX = previous.left - next.left
        const deltaY = previous.top - next.top
        const scaleX = next.width > 0 ? previous.width / next.width : 1
        const scaleY = next.height > 0 ? previous.height / next.height : 1
        if (
          Math.abs(deltaX) < 0.5 &&
          Math.abs(deltaY) < 0.5 &&
          Math.abs(scaleX - 1) < 0.005 &&
          Math.abs(scaleY - 1) < 0.005
        ) {
          return
        }

        animatePanelPreview(node, `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`)
      })
    }

    previewPanelRectsRef.current = nextRects
  }, [dragState, previewWorkspace.layout])

  useEffect(() => {
    const storedWorkspace = storage.loadPanelWorkspace()
    if (storedWorkspace) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWorkspace(storedWorkspace)
    }
    setLayoutHydrated(true)
  }, [])

  useEffect(() => {
    if (!layoutHydrated) {
      return
    }
    storage.savePanelWorkspace(workspace)
  }, [layoutHydrated, workspace])

  const updateDragPreviewPosition = useCallback((event: { clientX: number; clientY: number }) => {
    if (event.clientX === 0 && event.clientY === 0) {
      return
    }

    const point = {
      x: event.clientX,
      y: event.clientY,
    }
    dragPreviewPointRef.current = point
    updateDragPreviewNodePosition(dragPreviewNodeRef.current, point)
  }, [])

  const setDragPreviewNode = useCallback((node: HTMLDivElement | null) => {
    dragPreviewNodeRef.current = node
    if (node && dragPreviewPointRef.current) {
      updateDragPreviewNodePosition(node, dragPreviewPointRef.current)
    }
  }, [])

  const cleanupPanelPointerDragSession = useCallback(() => {
    const cleanup = pointerDragCleanupRef.current
    pointerDragCleanupRef.current = null
    cleanup?.()

    const pendingDrag = pendingPanelPointerDragRef.current
    if (pendingDrag?.sourceElement.hasPointerCapture?.(pendingDrag.pointerId)) {
      pendingDrag.sourceElement.releasePointerCapture(pendingDrag.pointerId)
    }

    pendingPanelPointerDragRef.current = null
    document.body.style.userSelect = ""
    document.body.style.cursor = ""
  }, [])

  const clearPendingDropTarget = useCallback(() => {
    pendingDropTargetRef.current = null
    if (dropTargetTimeoutRef.current !== null) {
      window.clearTimeout(dropTargetTimeoutRef.current)
      dropTargetTimeoutRef.current = null
    }
  }, [])

  const applyDropTarget = useCallback(
    (target: ResolvedPointDrop) => {
      clearPendingDropTarget()
      lastDropTargetChangeAtRef.current = performance.now()

      if (target?.type === "dock") {
        const currentSource = dragStateRef.current?.source
        activeDropRef.current = null
        isDockActiveRef.current = currentSource === "layout"
        setActiveDrop(null)
        setIsDockActive(currentSource === "layout")
        return
      }

      isDockActiveRef.current = false
      setIsDockActive(false)

      if (
      target?.type === "gap" ||
      target?.type === "swap" ||
      target?.type === "panel-slot" ||
      target?.type === "group-slot" ||
      target?.type === "pair-slot" ||
      target?.type === "edge" ||
      target?.type === "workspace"
      ) {
        activeDropRef.current = target
        setActiveDrop((current) => (getResolvedDropKey(current) === getResolvedDropKey(target) ? current : target))
        return
      }

      activeDropRef.current = null
      setActiveDrop(null)
    },
    [clearPendingDropTarget],
  )

  const requestDropTarget = useCallback(
    (target: ResolvedPointDrop) => {
      const now = performance.now()
      const key = getResolvedDropKey(target)
      const currentTarget: ResolvedPointDrop = isDockActiveRef.current ? { type: "dock" } : activeDropRef.current

      if (getResolvedDropKey(currentTarget) === key) {
        clearPendingDropTarget()
        return
      }

      const pending = pendingDropTargetRef.current
      if (!pending || pending.key !== key) {
        clearPendingDropTarget()
        pendingDropTargetRef.current = {
          key,
          target,
          startedAt: now,
        }

        const dwellMs = target?.type === "dock" ? PANEL_DOCK_TARGET_DWELL_MS : PANEL_DROP_TARGET_DWELL_MS
        dropTargetTimeoutRef.current = window.setTimeout(() => {
          dropTargetTimeoutRef.current = null
          const latestPending = pendingDropTargetRef.current
          if (!latestPending || latestPending.key !== key) {
            return
          }

          const elapsedSinceSwitch = performance.now() - lastDropTargetChangeAtRef.current
          if (elapsedSinceSwitch < PANEL_DROP_TARGET_SWITCH_COOLDOWN_MS) {
            return
          }

          applyDropTarget(latestPending.target)
        }, dwellMs)
        return
      }

      const dwellMs = target?.type === "dock" ? PANEL_DOCK_TARGET_DWELL_MS : PANEL_DROP_TARGET_DWELL_MS
      if (
        now - pending.startedAt >= dwellMs &&
        now - lastDropTargetChangeAtRef.current >= PANEL_DROP_TARGET_SWITCH_COOLDOWN_MS
      ) {
        applyDropTarget(target)
      }
    },
    [applyDropTarget, clearPendingDropTarget],
  )

  const syncDropTargetFromPoint = useCallback(
    (event: DragPoint) => {
      const currentDragState = dragStateRef.current
      if (!currentDragState || event.clientX === 0 || event.clientY === 0) {
        return
      }

      const resolvedDrop = resolvePointDropTarget(event, currentDragState.panelId, dragTargetGeometryRef.current)
      requestDropTarget(resolvedDrop)
    },
    [requestDropTarget],
  )

  const endPanelDrag = useCallback(() => {
    clearPendingDropTarget()
    setDragState(null)
    setDragPreview(null)
    setActiveDrop(null)
    setIsDockActive(false)
    activeDropRef.current = null
    isDockActiveRef.current = false
    dragTargetGeometryRef.current = null
    dragPreviewPointRef.current = null
    dragPreviewNodeRef.current = null
    dragStateRef.current = null
  }, [clearPendingDropTarget])

  const collapsePanel = useCallback((panelId: PanelId) => {
    setWorkspace((current) => collapsePanelInWorkspace(current, panelId))
  }, [])

  const restorePanel = useCallback((panelId: PanelId) => {
    setWorkspace((current) => restorePanelInWorkspace(current, panelId))
  }, [])

  const commitPanelDrag = useCallback(
    (
      panelId: PanelId,
      source: PanelDragSource,
      options: {
        overrideDrop?: ActivePanelDrop | null
        fallbackGapTarget?: SplitGapTarget
        fallbackGroupSlotTarget?: SplitGroupSlotTarget
        fallbackPanelSlotTarget?: PanelSlotTarget
        fallbackSwapTargetId?: PanelId
        fallbackEdgeSide?: WorkspaceEdgeSide
        forceDock?: boolean
      } = {},
    ) => {
      if (dropCommittedRef.current) {
        return
      }

      dropCommittedRef.current = true
      const shouldCollapseToDock = (options.forceDock || isDockActiveRef.current) && source === "layout"
      const committedActiveDrop = "overrideDrop" in options ? (options.overrideDrop ?? null) : activeDropRef.current
      setWorkspace((current) => {
        if (shouldCollapseToDock) {
          return collapsePanelInWorkspace(current, panelId)
        }

        const edgeSide = committedActiveDrop?.type === "edge" ? committedActiveDrop.side : options.fallbackEdgeSide
        if (edgeSide) {
          return movePanelToWorkspaceEdge(current, panelId, edgeSide)
        }

        if (committedActiveDrop?.type === "workspace") {
          return restorePanelInWorkspace(current, panelId)
        }

        const groupSlotTarget =
          committedActiveDrop?.type === "group-slot"
            ? committedActiveDrop.target
            : options.fallbackGroupSlotTarget
        if (groupSlotTarget) {
          return groupSlotTarget.path.length === 0
            ? movePanelToWorkspaceEdge(current, panelId, groupSlotTarget.side)
            : movePanelToLayoutPathSide(current, panelId, groupSlotTarget.path, groupSlotTarget.side)
        }

        const pairSlotTarget = committedActiveDrop?.type === "pair-slot" ? committedActiveDrop.target : null
        if (pairSlotTarget) {
          return movePanelToAdjacentPairSide(
            current,
            panelId,
            pairSlotTarget.beforeId,
            pairSlotTarget.afterId,
            pairSlotTarget.side,
          )
        }

        const panelSlotTarget =
          committedActiveDrop?.type === "panel-slot"
            ? committedActiveDrop.target
            : options.fallbackPanelSlotTarget
        if (panelSlotTarget) {
          const { targetId, side } = panelSlotTarget
          return panelId === targetId ? current : movePanelInWorkspace(current, panelId, targetId, side)
        }

        const gapTarget = committedActiveDrop?.type === "gap" ? committedActiveDrop.target : options.fallbackGapTarget
        if (gapTarget) {
          return movePanelToSplitGap(
            current,
            panelId,
            gapTarget.beforeId,
            gapTarget.afterId,
            gapTarget.direction,
          )
        }

        const swapTargetId = committedActiveDrop?.type === "swap" ? committedActiveDrop.targetId : options.fallbackSwapTargetId
        if (swapTargetId) {
          return panelId === swapTargetId ? current : swapPanelsInWorkspace(current, panelId, swapTargetId)
        }

        return current
      })
    },
    [],
  )

  const beginPanelPointerDrag = useCallback(
    (pendingDrag: PendingPanelPointerDrag, point: DragPoint) => {
      pendingDrag.started = true
      if (pendingDrag.source === "dock") {
        suppressNextDockClickRef.current = true
      }

      const nextDragState: PanelDragState = {
        panelId: pendingDrag.panelId,
        source: pendingDrag.source,
      }
      dropCommittedRef.current = false
      activeDropRef.current = null
      isDockActiveRef.current = false
      dragStateRef.current = nextDragState
      dragTargetGeometryRef.current = captureDragTargetGeometry()
      clearPendingDropTarget()
      lastDropTargetChangeAtRef.current = performance.now()
      dragPreviewPointRef.current = {
        x: point.clientX,
        y: point.clientY,
      }
      document.body.style.userSelect = "none"
      document.body.style.cursor = "grabbing"
      setDragState(nextDragState)
      setDragPreview({
        ...nextDragState,
        title: pendingDrag.title,
        x: point.clientX,
        y: point.clientY,
      })
      setActiveDrop(null)
      setIsDockActive(false)
    },
    [clearPendingDropTarget],
  )

  const finishPanelPointerDrag = useCallback(
    (event: globalThis.PointerEvent) => {
      const pendingDrag = pendingPanelPointerDragRef.current
      if (!pendingDrag || pendingDrag.pointerId !== event.pointerId) {
        return
      }

      if (pendingDrag.started) {
        event.preventDefault()
        const currentDragState = dragStateRef.current
        if (currentDragState) {
          updateDragPreviewPosition(event)
          const resolvedDrop = resolvePointDropTarget(
            event,
            currentDragState.panelId,
            dragTargetGeometryRef.current,
          )
          commitPanelDrag(currentDragState.panelId, currentDragState.source, {
            forceDock: resolvedDrop?.type === "dock" && currentDragState.source === "layout",
            overrideDrop: resolvedDrop?.type === "dock" ? null : resolvedDrop,
          })
        }
        endPanelDrag()
      }

      cleanupPanelPointerDragSession()
      if (pendingDrag.source === "dock" && pendingDrag.started) {
        window.setTimeout(() => {
          suppressNextDockClickRef.current = false
        }, 250)
      }
    },
    [cleanupPanelPointerDragSession, commitPanelDrag, endPanelDrag, updateDragPreviewPosition],
  )

  const cancelPanelPointerDrag = useCallback(() => {
    const pendingDrag = pendingPanelPointerDragRef.current
    const shouldEndDrag = pendingDrag?.started
    cleanupPanelPointerDragSession()
    if (shouldEndDrag) {
      endPanelDrag()
    }
    if (pendingDrag?.source === "dock") {
      suppressNextDockClickRef.current = false
    }
  }, [cleanupPanelPointerDragSession, endPanelDrag])

  const startPanelPointerDrag = useCallback(
    (panelId: PanelId, source: PanelDragSource, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || pendingPanelPointerDragRef.current || dragStateRef.current) {
        return
      }

      const sourceElement = event.currentTarget
      const ownerWindow = sourceElement.ownerDocument.defaultView ?? window
      pendingPanelPointerDragRef.current = {
        panelId,
        source,
        title: panelConfigs[panelId].title,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        started: false,
        sourceElement,
      }

      sourceElement.setPointerCapture?.(event.pointerId)

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        const pendingDrag = pendingPanelPointerDragRef.current
        if (!pendingDrag || pendingDrag.pointerId !== moveEvent.pointerId) {
          return
        }

        const point = {
          clientX: moveEvent.clientX,
          clientY: moveEvent.clientY,
        }
        if (!pendingDrag.started) {
          const distance = Math.hypot(
            moveEvent.clientX - pendingDrag.startX,
            moveEvent.clientY - pendingDrag.startY,
          )
          if (distance < PANEL_POINTER_DRAG_START_PX) {
            return
          }
          beginPanelPointerDrag(pendingDrag, point)
        }

        moveEvent.preventDefault()
        updateDragPreviewPosition(moveEvent)
        syncDropTargetFromPoint(moveEvent)
      }

      const handlePointerUp = (pointerUpEvent: globalThis.PointerEvent) => {
        finishPanelPointerDrag(pointerUpEvent)
      }

      const handlePointerCancel = (pointerCancelEvent: globalThis.PointerEvent) => {
        const pendingDrag = pendingPanelPointerDragRef.current
        if (pendingDrag?.pointerId === pointerCancelEvent.pointerId) {
          cancelPanelPointerDrag()
        }
      }

      const handleKeyDown = (keyEvent: globalThis.KeyboardEvent) => {
        if (keyEvent.key === "Escape" && pendingPanelPointerDragRef.current) {
          keyEvent.preventDefault()
          cancelPanelPointerDrag()
        }
      }

      ownerWindow.addEventListener("pointermove", handlePointerMove, true)
      ownerWindow.addEventListener("pointerup", handlePointerUp, true)
      ownerWindow.addEventListener("pointercancel", handlePointerCancel, true)
      ownerWindow.addEventListener("keydown", handleKeyDown, true)
      pointerDragCleanupRef.current = () => {
        ownerWindow.removeEventListener("pointermove", handlePointerMove, true)
        ownerWindow.removeEventListener("pointerup", handlePointerUp, true)
        ownerWindow.removeEventListener("pointercancel", handlePointerCancel, true)
        ownerWindow.removeEventListener("keydown", handleKeyDown, true)
      }
    },
    [
      beginPanelPointerDrag,
      cancelPanelPointerDrag,
      finishPanelPointerDrag,
      panelConfigs,
      syncDropTargetFromPoint,
      updateDragPreviewPosition,
    ],
  )

  const shouldSuppressDockRestoreClick = useCallback(() => {
    if (!suppressNextDockClickRef.current) {
      return false
    }

    suppressNextDockClickRef.current = false
    return true
  }, [])

  useEffect(() => () => cleanupPanelPointerDragSession(), [cleanupPanelPointerDragSession])

  const startResize = useCallback(
    (
      path: SplitPath,
      direction: SplitDirection,
      event: ReactMouseEvent<HTMLDivElement>,
      splitContainer: HTMLDivElement,
    ) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      const currentLayout = workspaceRef.current.layout
      const groupPath = getSplitResizeGroupPath(currentLayout, path, direction)
      const groupContainer = groupPath ? getSplitContainerElement(groupPath) ?? splitContainer : splitContainer
      const groupRect = groupContainer.getBoundingClientRect()
      const groupAxisSize = direction === "row" ? groupRect.width : groupRect.height
      const minPanelSize = direction === "row" ? MIN_PANEL_WIDTH_PX : MIN_PANEL_HEIGHT_PX
      const resizeSession = createSplitResizeSession(
        currentLayout,
        path,
        direction,
        groupAxisSize,
        minPanelSize,
        SPLITTER_SIZE_PX,
      )

      if (!resizeSession) {
        return
      }

      const startPointer = direction === "row" ? event.clientX : event.clientY
      let currentResizeSession = resizeSession
      let appliedPointer = startPointer
      const pathKey = getPathKey(path)
      setResizingPathKey(pathKey)
      document.body.style.userSelect = "none"
      document.body.style.cursor = direction === "row" ? "col-resize" : "row-resize"

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const nextPointer = direction === "row" ? moveEvent.clientX : moveEvent.clientY
        const delta = nextPointer - appliedPointer
        const resizeResult = resizeSplitSession(currentResizeSession, delta)
        if (resizeResult.appliedDelta === 0) {
          return
        }

        currentResizeSession = resizeResult.session
        appliedPointer += resizeResult.appliedDelta
        setWorkspace((current) => {
          const nextLayout = applySplitResizeSession(current.layout, currentResizeSession)
          return nextLayout === current.layout ? current : { ...current, layout: nextLayout }
        })
      }

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
        document.body.style.userSelect = ""
        document.body.style.cursor = ""
        setResizingPathKey(null)
      }

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    },
    [],
  )

  const handleSplitterKeyDown = useCallback((path: SplitPath, direction: SplitDirection, event: KeyboardEvent<HTMLDivElement>) => {
    const isHorizontalStep =
      direction === "row" && (event.key === "ArrowLeft" || event.key === "ArrowRight")
    const isVerticalStep =
      direction === "column" && (event.key === "ArrowUp" || event.key === "ArrowDown")

    if (!isHorizontalStep && !isVerticalStep) {
      return
    }

    event.preventDefault()
    const sign = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1
    setWorkspace((current) => {
      const groupPath = getSplitResizeGroupPath(current.layout, path, direction)
      const groupContainer = groupPath ? getSplitContainerElement(groupPath) : null
      const groupRect = groupContainer?.getBoundingClientRect()
      const groupAxisSize = groupRect ? (direction === "row" ? groupRect.width : groupRect.height) : 0
      const minPanelSize = direction === "row" ? MIN_PANEL_WIDTH_PX : MIN_PANEL_HEIGHT_PX
      const resizeSession = createSplitResizeSession(
        current.layout,
        path,
        direction,
        groupAxisSize,
        minPanelSize,
        SPLITTER_SIZE_PX,
      )

      if (resizeSession) {
        const delta = sign * Math.max(KEYBOARD_RESIZE_STEP_MIN_PX, groupAxisSize * KEYBOARD_RESIZE_STEP)
        const nextLayout = resizeSplitLayoutFromSession(current.layout, resizeSession, delta)
        return nextLayout === current.layout ? current : { ...current, layout: nextLayout }
      }

      const currentRatio = getSplitRatioAtPath(current.layout, path) ?? 0.5
      return {
        ...current,
        layout: updateSplitRatio(current.layout, path, currentRatio + sign * KEYBOARD_RESIZE_STEP),
      }
    })
  }, [])

  const workspaceAreaStyle = getWorkspaceEdgePreviewStyle(activeDrop)
  const shouldShowDock = workspace.collapsed.length > 0 || dragState !== null
  const dockExpanded = workspace.collapsed.length > 0 && isDockExpanded
  const isPanelDragActive = dragState !== null
  const isPanelContentSuppressed = isPanelDragActive || resizingPathKey !== null

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/30"
    >
      <div className="relative min-h-0 min-w-0 flex-1">
        <div
          data-panel-workspace-area="true"
          className="h-full min-h-0 min-w-0 overflow-auto p-2 transition-[padding] duration-150 ease-out"
          style={workspaceAreaStyle}
        >
          {previewWorkspace.layout ? (
            <PanelLayoutView
              node={previewWorkspace.layout}
              path={[]}
              panelConfigs={panelConfigs}
              draggedPanelId={dragState?.panelId ?? null}
              isPanelDragActive={isPanelDragActive}
              isPanelContentSuppressed={isPanelContentSuppressed}
              activeDrop={activeDrop}
              resizingPathKey={resizingPathKey}
              onCollapsePanel={collapsePanel}
              onPanelPointerDragStart={startPanelPointerDrag}
              onResizeStart={startResize}
              onSplitterKeyDown={handleSplitterKeyDown}
            />
          ) : (
            <EmptyWorkspace
              collapsedPanels={workspace.collapsed}
              panelConfigs={panelConfigs}
              dropActive={activeDrop?.type === "workspace"}
              onRestorePanel={restorePanel}
            />
          )}
        </div>
        <EdgeDropPreview activeDrop={activeDrop} />
        <PairSlotPreview activeDrop={activeDrop} />
      </div>
      {shouldShowDock && (
        <CollapsedPanelDock
          collapsedPanels={workspace.collapsed}
          panelConfigs={panelConfigs}
          dragState={dragState}
          active={isDockActive}
          expanded={dockExpanded}
          onExpandedChange={setIsDockExpanded}
          onPanelPointerDragStart={startPanelPointerDrag}
          onShouldSuppressRestoreClick={shouldSuppressDockRestoreClick}
          onRestorePanel={restorePanel}
        />
      )}
      <PanelCursorPreview preview={dragPreview} previewRef={setDragPreviewNode} />
    </div>
  )
}

function PanelLayoutView({
  node,
  path,
  panelConfigs,
  draggedPanelId,
  isPanelDragActive,
  isPanelContentSuppressed,
  activeDrop,
  resizingPathKey,
  onCollapsePanel,
  onPanelPointerDragStart,
  onResizeStart,
  onSplitterKeyDown,
}: {
  node: PanelLayoutNode
  path: SplitPath
  panelConfigs: PanelConfigs
  draggedPanelId: PanelId | null
  isPanelDragActive: boolean
  isPanelContentSuppressed: boolean
  activeDrop: ActivePanelDrop | null
  resizingPathKey: string | null
  onCollapsePanel: (panelId: PanelId) => void
  onPanelPointerDragStart: (panelId: PanelId, source: PanelDragSource, event: ReactPointerEvent<HTMLElement>) => void
  onResizeStart: (
    path: SplitPath,
    direction: SplitDirection,
    event: ReactMouseEvent<HTMLDivElement>,
    splitContainer: HTMLDivElement,
  ) => void
  onSplitterKeyDown: (path: SplitPath, direction: SplitDirection, event: KeyboardEvent<HTMLDivElement>) => void
}) {
  if (node.type === "panel") {
    const panel = panelConfigs[node.id]
    const panelSlotSide =
      activeDrop?.type === "panel-slot" && activeDrop.target.targetId === node.id
        ? activeDrop.target.side
        : null
    const pairSlotSide =
      activeDrop?.type === "pair-slot" &&
      (activeDrop.target.beforeId === node.id || activeDrop.target.afterId === node.id)
        ? activeDrop.target.side
        : null
    return (
      <PanelSlotFrame side={panelSlotSide} paddingSide={panelSlotSide ?? pairSlotSide}>
        <ToolPanel
          panelId={node.id}
          title={panel.title}
          isPanelContentSuppressed={isPanelContentSuppressed}
          isDraggedPanel={draggedPanelId === node.id}
          isSwapTarget={activeDrop?.type === "swap" && activeDrop.targetId === node.id}
          onCollapse={onCollapsePanel}
          onPointerDragStart={onPanelPointerDragStart}
        >
          {panel.content}
        </ToolPanel>
      </PanelSlotFrame>
    )
  }

  return (
    <SplitNode
      node={node}
      path={path}
      panelConfigs={panelConfigs}
      draggedPanelId={draggedPanelId}
      isPanelDragActive={isPanelDragActive}
      isPanelContentSuppressed={isPanelContentSuppressed}
      activeDrop={activeDrop}
      resizingPathKey={resizingPathKey}
      onCollapsePanel={onCollapsePanel}
      onPanelPointerDragStart={onPanelPointerDragStart}
      onResizeStart={onResizeStart}
      onSplitterKeyDown={onSplitterKeyDown}
    />
  )
}

function SplitNode({
  node,
  path,
  panelConfigs,
  draggedPanelId,
  isPanelDragActive,
  isPanelContentSuppressed,
  activeDrop,
  resizingPathKey,
  onCollapsePanel,
  onPanelPointerDragStart,
  onResizeStart,
  onSplitterKeyDown,
}: {
  node: Extract<PanelLayoutNode, { type: "split" }>
  path: SplitPath
  panelConfigs: PanelConfigs
  draggedPanelId: PanelId | null
  isPanelDragActive: boolean
  isPanelContentSuppressed: boolean
  activeDrop: ActivePanelDrop | null
  resizingPathKey: string | null
  onCollapsePanel: (panelId: PanelId) => void
  onPanelPointerDragStart: (panelId: PanelId, source: PanelDragSource, event: ReactPointerEvent<HTMLElement>) => void
  onResizeStart: (
    path: SplitPath,
    direction: SplitDirection,
    event: ReactMouseEvent<HTMLDivElement>,
    splitContainer: HTMLDivElement,
  ) => void
  onSplitterKeyDown: (path: SplitPath, direction: SplitDirection, event: KeyboardEvent<HTMLDivElement>) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isRow = node.direction === "row"
  const firstPath = useMemo<SplitPath>(() => [...path, "first"], [path])
  const secondPath = useMemo<SplitPath>(() => [...path, "second"], [path])
  const pathKey = getPathKey(path)
  const activeGroupSlotSide =
    activeDrop?.type === "group-slot" && activeDrop.target.pathKey === pathKey ? activeDrop.target.side : null
  const firstMinSize = getPanelLayoutMinSize(
    node.first,
    node.direction,
    isRow ? MIN_PANEL_WIDTH_PX : MIN_PANEL_HEIGHT_PX,
    SPLITTER_SIZE_PX,
  )
  const secondMinSize = getPanelLayoutMinSize(
    node.second,
    node.direction,
    isRow ? MIN_PANEL_WIDTH_PX : MIN_PANEL_HEIGHT_PX,
    SPLITTER_SIZE_PX,
  )
  const gapTarget = useMemo<SplitGapTarget>(
    () => ({
      pathKey,
      direction: node.direction,
      beforeId: getPanelIds(node.first).at(-1) ?? null,
      afterId: getPanelIds(node.second)[0] ?? null,
    }),
    [node.direction, node.first, node.second, pathKey],
  )

  return (
    <div
      ref={containerRef}
      data-panel-split-path={pathKey}
      data-panel-split-direction={node.direction}
      className={cn(
        "relative flex h-full min-h-0 min-w-0 transition-[padding] duration-150 ease-out",
        !isRow && "flex-col",
        activeGroupSlotSide === "left" && "pl-11",
        activeGroupSlotSide === "right" && "pr-11",
        activeGroupSlotSide === "top" && "pt-11",
        activeGroupSlotSide === "bottom" && "pb-11",
      )}
    >
      <div
        className="min-h-0 min-w-0"
        style={{
          flex: `0 0 calc(${node.ratio * 100}% - ${SPLITTER_SIZE_PX * node.ratio}px)`,
          minWidth: isRow ? firstMinSize : undefined,
          minHeight: isRow ? undefined : firstMinSize,
        }}
      >
        <PanelLayoutView
          node={node.first}
          path={firstPath}
          panelConfigs={panelConfigs}
          draggedPanelId={draggedPanelId}
          isPanelDragActive={isPanelDragActive}
          isPanelContentSuppressed={isPanelContentSuppressed}
          activeDrop={activeDrop}
          resizingPathKey={resizingPathKey}
          onCollapsePanel={onCollapsePanel}
          onPanelPointerDragStart={onPanelPointerDragStart}
          onResizeStart={onResizeStart}
          onSplitterKeyDown={onSplitterKeyDown}
        />
      </div>

      <SplitHandle
        gapTarget={gapTarget}
        direction={node.direction}
        active={resizingPathKey === pathKey || (activeDrop?.type === "gap" && activeDrop.target.pathKey === pathKey)}
        dropActive={activeDrop?.type === "gap" && activeDrop.target.pathKey === pathKey}
        isPanelDragActive={isPanelDragActive}
        onMouseDown={(event) => {
          if (!containerRef.current) {
            return
          }
          onResizeStart(path, node.direction, event, containerRef.current)
        }}
        onKeyDown={(event) => onSplitterKeyDown(path, node.direction, event)}
      />

      <div
        className="min-h-0 min-w-0 flex-1"
        style={{
          minWidth: isRow ? secondMinSize : undefined,
          minHeight: isRow ? undefined : secondMinSize,
        }}
      >
        <PanelLayoutView
          node={node.second}
          path={secondPath}
          panelConfigs={panelConfigs}
          draggedPanelId={draggedPanelId}
          isPanelDragActive={isPanelDragActive}
          isPanelContentSuppressed={isPanelContentSuppressed}
          activeDrop={activeDrop}
          resizingPathKey={resizingPathKey}
          onCollapsePanel={onCollapsePanel}
          onPanelPointerDragStart={onPanelPointerDragStart}
          onResizeStart={onResizeStart}
          onSplitterKeyDown={onSplitterKeyDown}
        />
      </div>
      <GroupSlotPreview side={activeGroupSlotSide} />
    </div>
  )
}

function ToolPanel({
  panelId,
  title,
  isPanelContentSuppressed,
  isDraggedPanel,
  isSwapTarget,
  onCollapse,
  onPointerDragStart,
  children,
}: {
  panelId: PanelId
  title: string
  isPanelContentSuppressed: boolean
  isDraggedPanel: boolean
  isSwapTarget: boolean
  onCollapse: (panelId: PanelId) => void
  onPointerDragStart: (panelId: PanelId, source: PanelDragSource, event: ReactPointerEvent<HTMLElement>) => void
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border bg-background shadow-sm transition-opacity duration-150 ease-out",
        isDraggedPanel && "opacity-50",
        isSwapTarget && "ring-2 ring-orange-500/80",
      )}
      data-tool-panel={panelId}
    >
      <PanelHeader
        panelId={panelId}
        title={title}
        onCollapse={onCollapse}
        onPointerDragStart={onPointerDragStart}
      />
      <PanelContentTransition suppressed={isPanelContentSuppressed} title={title} active={isDraggedPanel}>
        {children}
      </PanelContentTransition>
      <SwapPreview active={isSwapTarget} />
    </section>
  )
}

function PanelSlotFrame({
  side,
  paddingSide,
  children,
}: {
  side: PanelSlotSide | null
  paddingSide: DropSide | null
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "relative h-full min-h-0 min-w-0 transition-[padding] duration-150 ease-out",
        paddingSide === "left" && "pl-11",
        paddingSide === "right" && "pr-11",
        paddingSide === "top" && "pt-11",
        paddingSide === "bottom" && "pb-11",
      )}
      data-panel-slot-frame={paddingSide ?? undefined}
    >
      {children}
      <PanelSlotPreview side={side} />
    </div>
  )
}

function PanelContentTransition({
  suppressed,
  title,
  active,
  children,
}: {
  suppressed: boolean
  title: string
  active: boolean
  children: ReactNode
}) {
  const [keepContentMounted, setKeepContentMounted] = useState(!suppressed)

  useEffect(() => {
    const delay = suppressed ? PANEL_SIMPLE_WORKSPACE_FADE_MS : 0
    const timeout = window.setTimeout(() => {
      setKeepContentMounted(!suppressed)
    }, delay)

    return () => window.clearTimeout(timeout)
  }, [suppressed])

  const transitionStyle: CSSProperties = {
    transitionDuration: `${PANEL_SIMPLE_WORKSPACE_FADE_MS}ms`,
    transitionTimingFunction: PANEL_PREVIEW_EASING,
    willChange: "opacity, transform",
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {(!suppressed || keepContentMounted) && (
        <div
          className={cn(
            "absolute inset-0 min-h-0 overflow-auto transition-[opacity,transform]",
            suppressed ? "pointer-events-none scale-[0.992] opacity-0" : "scale-100 opacity-100",
          )}
          aria-hidden={suppressed}
          style={transitionStyle}
        >
          {children}
        </div>
      )}
      {suppressed && (
        <div
          className="animate-in fade-in-0 zoom-in-95 absolute inset-0 duration-150"
          style={{
            animationDuration: `${PANEL_SIMPLE_WORKSPACE_FADE_MS}ms`,
            animationTimingFunction: PANEL_PREVIEW_EASING,
          }}
        >
          <PanelDragPlaceholder title={title} active={active} />
        </div>
      )}
    </div>
  )
}

function PanelDragPlaceholder({ title, active }: { title: string; active: boolean }) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-muted/35 p-4",
        active && "bg-muted/25",
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(24,24,24,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(24,24,24,0.06)_1px,transparent_1px)] bg-[size:28px_28px]" />
      <div
        className={cn(
          "relative flex min-h-28 w-full max-w-sm items-center justify-center rounded-md border bg-background/90 px-5 py-6 text-center shadow-sm",
          active ? "border-border/60 text-muted-foreground" : "border-border/70 text-foreground",
        )}
      >
        <span className="text-base font-semibold leading-tight">{title}</span>
      </div>
    </div>
  )
}

function PanelCursorPreview({
  preview,
  previewRef,
}: {
  preview: PanelCursorPreviewState | null
  previewRef: (node: HTMLDivElement | null) => void
}) {
  if (!preview) {
    return null
  }

  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-50 w-56 max-w-[calc(100vw-2rem)]"
      ref={previewRef}
      data-panel-drag-preview={preview.panelId}
      aria-hidden="true"
      style={{
        transform: getDragPreviewTransform(preview.x, preview.y),
        willChange: "transform",
      }}
    >
      <div className="flex h-11 items-center gap-2 rounded-md border border-orange-500/80 bg-background/95 px-3 text-sm font-semibold text-foreground shadow-lg shadow-orange-500/15 ring-1 ring-orange-500/15 backdrop-blur">
        <GripVertical className="h-4 w-4 shrink-0 text-orange-600" />
        <span className="min-w-0 flex-1 truncate">{preview.title}</span>
      </div>
    </div>
  )
}

function updateDragPreviewNodePosition(
  node: HTMLDivElement | null,
  point: { x: number; y: number },
) {
  if (!node) {
    return
  }

  node.style.transform = getDragPreviewTransform(point.x, point.y)
}

function getDragPreviewTransform(x: number, y: number): string {
  return `translate3d(${x + PANEL_DRAG_PREVIEW_OFFSET_X}px, ${y + PANEL_DRAG_PREVIEW_OFFSET_Y}px, 0)`
}

function PanelHeader({ panelId, title, onCollapse, onPointerDragStart }: PanelHeaderProps) {
  return (
    <div
      className="group flex h-10 shrink-0 cursor-grab touch-none select-none items-center justify-between gap-3 border-b border-border bg-background px-3 text-sm font-semibold text-foreground shadow-xs active:cursor-grabbing"
      onPointerDown={(event) => onPointerDragStart(panelId, "layout", event)}
      data-panel-toggle={title}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition group-hover:bg-muted group-hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </span>
        <span className="truncate leading-tight">{title}</span>
      </div>
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label={`Collapse ${title}`}
        title={`Collapse ${title}`}
        onClick={(event) => {
          event.stopPropagation()
          onCollapse(panelId)
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Minimize2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function SplitHandle({
  gapTarget,
  direction,
  active,
  dropActive,
  isPanelDragActive,
  onMouseDown,
  onKeyDown,
}: {
  gapTarget: SplitGapTarget
  direction: SplitDirection
  active: boolean
  dropActive: boolean
  isPanelDragActive: boolean
  onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}) {
  const isRow = direction === "row"
  return (
    <div
      role="separator"
      aria-orientation={isRow ? "vertical" : "horizontal"}
      tabIndex={0}
      data-panel-divider="true"
      data-panel-gap="true"
      data-panel-gap-path={gapTarget.pathKey}
      data-panel-gap-direction={gapTarget.direction}
      data-panel-gap-before={gapTarget.beforeId ?? undefined}
      data-panel-gap-after={gapTarget.afterId ?? undefined}
      className={cn(
        "group relative z-20 flex shrink-0 items-center justify-center outline-none transition-[background-color,width,height] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-orange-500/70",
        isRow
          ? dropActive
            ? "w-11 cursor-copy"
            : isPanelDragActive
              ? "w-5 cursor-copy"
              : "w-3 cursor-col-resize"
          : dropActive
            ? "h-11 cursor-copy"
            : isPanelDragActive
              ? "h-5 cursor-copy"
              : "h-3 cursor-row-resize",
        active && "bg-orange-500/10",
        dropActive && "bg-orange-500/20 ring-1 ring-inset ring-orange-500/40",
      )}
      onMouseDown={(event) => {
        if (isPanelDragActive) {
          return
        }
        onMouseDown(event)
      }}
      onKeyDown={onKeyDown}
    >
      <span
        className={cn(
          "rounded-full transition-[background-color,width,height] duration-150 ease-out",
          isRow ? (dropActive ? "h-20 w-1.5" : "h-16 w-1") : dropActive ? "h-1.5 w-20" : "h-1 w-16",
          active ? "bg-orange-500" : "bg-border group-hover:bg-orange-500 group-focus-visible:bg-orange-500",
        )}
      />
    </div>
  )
}

function CollapsedPanelDock({
  collapsedPanels,
  panelConfigs,
  dragState,
  active,
  expanded,
  onExpandedChange,
  onPanelPointerDragStart,
  onShouldSuppressRestoreClick,
  onRestorePanel,
}: {
  collapsedPanels: PanelId[]
  panelConfigs: PanelConfigs
  dragState: { panelId: PanelId; source: PanelDragSource } | null
  active: boolean
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onPanelPointerDragStart: (panelId: PanelId, source: PanelDragSource, event: ReactPointerEvent<HTMLElement>) => void
  onShouldSuppressRestoreClick: () => boolean
  onRestorePanel: (panelId: PanelId) => void
}) {
  return (
    <aside
      data-panel-divider="true"
      data-panel-dock="true"
      className={cn(
        "relative z-40 flex h-full shrink-0 border-l border-border/80 bg-background/95 shadow-[-8px_0_18px_rgba(15,23,42,0.08)] backdrop-blur transition-[width,border-color,background-color,box-shadow] duration-150 ease-out",
        expanded ? (active ? "w-60" : "w-56") : active ? "w-14" : "w-12",
        active && "border-orange-500 bg-orange-50 shadow-[-10px_0_24px_rgba(249,115,22,0.16)]",
      )}
    >
      <div className={cn("flex h-full min-w-0 flex-col", expanded ? "w-full p-2" : "w-full items-center p-1.5")}>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 w-7 cursor-pointer items-center justify-center self-start rounded-md bg-transparent text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            !expanded && "self-center",
          )}
          aria-label={expanded ? "Collapse panel dock" : "Expand panel dock"}
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>

        <div
          className={cn(
            "mt-2 flex min-h-0 flex-1 overflow-y-auto",
            expanded ? "flex-col gap-2" : "flex-col items-center gap-1.5",
          )}
        >
          {collapsedPanels.length === 0 ? (
            <div
              className={cn(
                "flex items-center justify-center rounded-md border border-dashed text-muted-foreground transition",
                expanded ? "min-h-20 w-full px-2" : "h-9 w-9",
                active ? "border-orange-500 bg-orange-100 text-orange-700" : "border-border/80 bg-muted/30",
              )}
              aria-label={dragState ? "Panel dock drop target" : "No collapsed panels"}
            >
              <Minimize2 className="h-4 w-4 shrink-0" />
              {expanded && <span className="ml-2 truncate text-xs font-semibold">Empty</span>}
            </div>
          ) : (
            collapsedPanels.map((panelId) => {
              const panel = panelConfigs[panelId]
              const PanelIcon = panel.icon
              return (
                <button
                  key={panelId}
                  type="button"
                  className={cn(
                    "inline-flex cursor-grab touch-none select-none items-center rounded-md border border-border bg-background text-xs font-semibold text-foreground shadow-xs transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing",
                    expanded ? "h-10 w-full justify-start gap-2 px-2" : "h-9 w-9 justify-center",
                  )}
                  title={`Show ${panel.title}`}
                  aria-label={`Show ${panel.title}`}
                  data-panel-toggle={panel.title}
                  onClick={(event) => {
                    if (onShouldSuppressRestoreClick()) {
                      event.preventDefault()
                      event.stopPropagation()
                      return
                    }
                    onRestorePanel(panelId)
                  }}
                  onPointerDown={(event) => onPanelPointerDragStart(panelId, "dock", event)}
                >
                  <PanelIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {expanded && <span className="truncate">{panel.title}</span>}
                </button>
              )
            })
          )}
        </div>
      </div>
    </aside>
  )
}

function SwapPreview({ active }: { active: boolean }) {
  if (!active) {
    return null
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30 rounded-md bg-orange-500/5">
      <div className="absolute inset-1 rounded-md border-2 border-dashed border-orange-500 bg-orange-500/10" />
    </div>
  )
}

function PanelSlotPreview({ side }: { side: PanelSlotSide | null }) {
  if (!side) {
    return null
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-2 z-30 flex h-11 items-center justify-center bg-orange-500/20 shadow-lg shadow-orange-500/10 ring-1 ring-inset ring-orange-500/40",
        side === "top" ? "top-0" : "bottom-0",
      )}
      data-panel-slot-drop={side}
      aria-hidden="true"
    >
      <span className="h-1.5 w-20 rounded-full bg-orange-500 shadow-sm" />
    </div>
  )
}

function GroupSlotPreview({ side }: { side: DropSide | null }) {
  if (!side) {
    return null
  }

  const isVerticalIndicator = side === "left" || side === "right"
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-30 flex items-center justify-center bg-orange-500/20 shadow-lg shadow-orange-500/10 ring-1 ring-inset ring-orange-500/40",
        side === "left" && "inset-y-2 left-0 w-11",
        side === "right" && "inset-y-2 right-0 w-11",
        side === "top" && "inset-x-2 top-0 h-11",
        side === "bottom" && "inset-x-2 bottom-0 h-11",
      )}
      data-panel-group-slot-drop={side}
      aria-hidden="true"
    >
      <span className={cn("rounded-full bg-orange-500 shadow-sm", isVerticalIndicator ? "h-20 w-1.5" : "h-1.5 w-20")} />
    </div>
  )
}

function EdgeDropPreview({ activeDrop }: { activeDrop: ActivePanelDrop | null }) {
  if (activeDrop?.type !== "edge") {
    return null
  }

  const isVerticalEdge = activeDrop.side === "left" || activeDrop.side === "right"
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-30 flex items-center justify-center bg-orange-500/20 shadow-lg shadow-orange-500/10 ring-1 ring-inset ring-orange-500/40 transition-[background-color,width,height] duration-150 ease-out",
        activeDrop.side === "left" && "inset-y-2 left-0 w-11",
        activeDrop.side === "right" && "inset-y-2 right-0 w-11",
        activeDrop.side === "top" && "inset-x-2 top-0 h-11",
        activeDrop.side === "bottom" && "inset-x-2 bottom-0 h-11",
      )}
      data-panel-edge-drop={activeDrop.side}
      aria-hidden="true"
    >
      <span className={cn("rounded-full bg-orange-500 shadow-sm", isVerticalEdge ? "h-20 w-1.5" : "h-1.5 w-20")} />
    </div>
  )
}

function PairSlotPreview({ activeDrop }: { activeDrop: ActivePanelDrop | null }) {
  if (activeDrop?.type !== "pair-slot") {
    return null
  }

  const { rect, side } = activeDrop.target
  const isVerticalIndicator = side === "left" || side === "right"
  const endAxisSize = isVerticalIndicator ? rect.height : rect.width
  const endInset = Math.min(
    PANEL_PAIR_SLOT_PREVIEW_END_INSET_PX,
    Math.max(0, (endAxisSize - PANEL_EDGE_GAP_PREVIEW_PX) / 2),
  )
  const style: CSSProperties =
    side === "left"
      ? {
          left: rect.left,
          top: rect.top + endInset,
          width: PANEL_EDGE_GAP_PREVIEW_PX,
          height: Math.max(0, rect.height - endInset * 2),
        }
      : side === "right"
        ? {
            left: rect.right - PANEL_EDGE_GAP_PREVIEW_PX,
            top: rect.top + endInset,
            width: PANEL_EDGE_GAP_PREVIEW_PX,
            height: Math.max(0, rect.height - endInset * 2),
          }
        : side === "top"
          ? {
              left: rect.left + endInset,
              top: rect.top,
              width: Math.max(0, rect.width - endInset * 2),
              height: PANEL_EDGE_GAP_PREVIEW_PX,
            }
          : {
              left: rect.left + endInset,
              top: rect.bottom - PANEL_EDGE_GAP_PREVIEW_PX,
              width: Math.max(0, rect.width - endInset * 2),
              height: PANEL_EDGE_GAP_PREVIEW_PX,
            }

  return (
    <div
      className="pointer-events-none fixed z-30 flex items-center justify-center bg-orange-500/20 shadow-lg shadow-orange-500/10 ring-1 ring-inset ring-orange-500/40 transition-[background-color,width,height] duration-150 ease-out"
      data-panel-pair-slot-drop={side}
      aria-hidden="true"
      style={style}
    >
      <span className={cn("rounded-full bg-orange-500 shadow-sm", isVerticalIndicator ? "h-20 w-1.5" : "h-1.5 w-20")} />
    </div>
  )
}

function getWorkspaceEdgePreviewStyle(
  activeDrop: ActivePanelDrop | null,
): CSSProperties | undefined {
  if (activeDrop?.type !== "edge") {
    return undefined
  }

  if (activeDrop.side === "left") {
    return { paddingLeft: PANEL_EDGE_GAP_PREVIEW_PX }
  }

  if (activeDrop.side === "right") {
    return { paddingRight: PANEL_EDGE_GAP_PREVIEW_PX }
  }

  if (activeDrop.side === "top") {
    return { paddingTop: PANEL_EDGE_GAP_PREVIEW_PX }
  }

  return { paddingBottom: PANEL_EDGE_GAP_PREVIEW_PX }
}

function EmptyWorkspace({
  collapsedPanels,
  panelConfigs,
  dropActive,
  onRestorePanel,
}: {
  collapsedPanels: PanelId[]
  panelConfigs: PanelConfigs
  dropActive: boolean
  onRestorePanel: (panelId: PanelId) => void
}) {
  return (
    <div
      data-panel-empty-workspace="true"
      className={cn(
        "relative flex h-full min-h-[280px] items-center justify-center rounded-md border border-dashed bg-background/70 p-4 transition-[background-color,border-color]",
        dropActive ? "border-orange-500 bg-orange-500/10" : "border-border",
      )}
    >
      <div className="relative z-10 flex max-w-full flex-wrap items-center justify-center gap-2">
        {collapsedPanels.map((panelId) => {
          const panel = panelConfigs[panelId]
          const PanelIcon = panel.icon
          return (
            <button
              key={panelId}
              type="button"
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold shadow-xs transition hover:bg-muted"
              onClick={() => onRestorePanel(panelId)}
              aria-label={`Show ${panel.title}`}
              title={`Show ${panel.title}`}
            >
              <PanelIcon className="h-4 w-4 text-muted-foreground" />
              {panel.title}
            </button>
          )
        })}
      </div>
      {dropActive && (
        <div className="pointer-events-none absolute inset-1 rounded-md border-2 border-dashed border-orange-500 bg-orange-500/10" />
      )}
    </div>
  )
}

function getPathKey(path: SplitPath): string {
  return path.length === 0 ? "root" : path.join(".")
}

function parseSplitPathKey(pathKey: string | undefined): SplitPath | null {
  if (!pathKey) {
    return null
  }

  if (pathKey === "root") {
    return []
  }

  const segments = pathKey.split(".")
  if (segments.every((segment): segment is SplitPath[number] => segment === "first" || segment === "second")) {
    return segments
  }

  return null
}

function getSplitContainerElement(path: SplitPath): HTMLDivElement | null {
  return document.querySelector<HTMLDivElement>(`[data-panel-split-path="${getPathKey(path)}"]`)
}

function getResolvedDropKey(target: ResolvedPointDrop): string {
  if (!target) {
    return "none"
  }

  if (target.type === "dock") {
    return "dock"
  }

  if (target.type === "swap") {
    return `swap:${target.targetId}`
  }

  if (target.type === "panel-slot") {
    return `panel-slot:${target.target.targetId}:${target.target.side}`
  }

  if (target.type === "group-slot") {
    return `group-slot:${target.target.pathKey}:${target.target.side}`
  }

  if (target.type === "pair-slot") {
    return `pair-slot:${target.target.beforeId}:${target.target.afterId}:${target.target.side}`
  }

  if (target.type === "edge") {
    return `edge:${target.side}`
  }

  if (target.type === "workspace") {
    return "workspace"
  }

  return [
    "gap",
    target.target.pathKey,
    target.target.direction,
    target.target.beforeId ?? "none",
    target.target.afterId ?? "none",
  ].join(":")
}

function captureDragTargetGeometry(): DragTargetGeometry {
  const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-tool-panel]")).flatMap((panel) => {
    const panelId = panel.dataset.toolPanel
    if (!isPanelId(panelId)) {
      return []
    }

    const rect = toMeasuredRect(panel.getBoundingClientRect())
    return [
      {
        panelId,
        rect,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      },
    ]
  })
  const workspaceArea = document.querySelector<HTMLElement>("[data-panel-workspace-area='true']")
  const workspaceRect = workspaceArea ? toMeasuredRect(workspaceArea.getBoundingClientRect()) : null

  return {
    panels,
    gaps: Array.from(document.querySelectorAll<HTMLElement>("[data-panel-gap='true']")).flatMap((gap) => {
      const target = readGapTarget(gap)
      if (!target) {
        return []
      }

      return [
        {
          target,
          rect: toMeasuredRect(gap.getBoundingClientRect()),
        },
      ]
    }),
    groups: Array.from(document.querySelectorAll<HTMLElement>("[data-panel-split-path]")).flatMap((group) => {
      const pathKey = group.dataset.panelSplitPath
      const path = parseSplitPathKey(pathKey)
      if (!pathKey || !path) {
        return []
      }

      const panelIds = Array.from(group.querySelectorAll<HTMLElement>("[data-tool-panel]")).flatMap((panel) => {
        const panelId = panel.dataset.toolPanel
        return isPanelId(panelId) ? [panelId] : []
      })
      return [
        {
          pathKey,
          path,
          rect: toMeasuredRect(group.getBoundingClientRect()),
          panelIds,
        },
      ]
    }),
    edges: getWorkspaceEdgeTargets(workspaceRect),
  }
}

function toMeasuredRect(rect: DOMRect): MeasuredRect {
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

function getWorkspaceEdgeTargets(workspaceRect: MeasuredRect | null): DragTargetGeometry["edges"] {
  if (!workspaceRect || workspaceRect.width <= 0 || workspaceRect.height <= 0) {
    return []
  }

  const edgeWidth = Math.max(0, Math.min(PANEL_EDGE_DROP_ZONE_PX, workspaceRect.width / 2))
  const edgeHeight = Math.max(0, Math.min(PANEL_EDGE_DROP_ZONE_PX, workspaceRect.height / 2))
  if (edgeWidth <= 0 || edgeHeight <= 0) {
    return []
  }

  return [
    {
      side: "left",
      rect: {
        ...workspaceRect,
        right: workspaceRect.left + edgeWidth,
        width: edgeWidth,
      },
    },
    {
      side: "right",
      rect: {
        ...workspaceRect,
        left: workspaceRect.right - edgeWidth,
        width: edgeWidth,
      },
    },
    {
      side: "top",
      rect: {
        ...workspaceRect,
        top: 0,
        bottom: workspaceRect.top + edgeHeight,
        height: workspaceRect.top + edgeHeight,
      },
    },
    {
      side: "bottom",
      rect: {
        ...workspaceRect,
        top: workspaceRect.bottom - edgeHeight,
        height: edgeHeight,
      },
    },
  ]
}

function resolvePointDropTarget(
  point: DragPoint,
  draggedPanelId: PanelId,
  geometry: DragTargetGeometry | null,
): ResolvedPointDrop {
  const element = document.elementFromPoint(point.clientX, point.clientY)
  if (!(element instanceof Element)) {
    return null
  }

  if (element.closest("[data-panel-dock='true']")) {
    return { type: "dock" }
  }

  if (element.closest("[data-panel-empty-workspace='true']")) {
    return { type: "workspace" }
  }

  const edgeTarget = getWorkspaceEdgeDropTarget(point, draggedPanelId, geometry)
  if (edgeTarget) {
    return edgeTarget
  }

  const gapEndpointTarget = getGapEndpointDropTargetFromPoint(point, draggedPanelId, geometry)
  if (gapEndpointTarget) {
    return gapEndpointTarget
  }

  const physicalGapTarget = getPhysicalGapTargetFromPoint(point, draggedPanelId, geometry)
  if (physicalGapTarget) {
    return {
      type: "gap",
      target: physicalGapTarget,
    }
  }

  const groupSlotTarget = getSplitGroupSlotTargetFromPoint(point, draggedPanelId, geometry)
  if (groupSlotTarget) {
    const equivalentGapTarget = getEquivalentGroupGapTarget(groupSlotTarget, geometry)
    if (equivalentGapTarget) {
      return {
        type: "gap",
        target: equivalentGapTarget,
      }
    }

    return groupSlotTarget.path.length === 0
      ? {
          type: "edge",
          side: groupSlotTarget.side,
        }
      : {
          type: "group-slot",
          target: groupSlotTarget,
        }
  }

  const panelSlotTarget = getPanelSlotTargetFromPoint(point, draggedPanelId, geometry)
  if (panelSlotTarget) {
    const equivalentGapTarget = getEquivalentVerticalGapTarget(panelSlotTarget, geometry)
    if (equivalentGapTarget) {
      return {
        type: "gap",
        target: equivalentGapTarget,
      }
    }

    return {
      type: "panel-slot",
      target: panelSlotTarget,
    }
  }

  const gapTarget = getNearestGapTarget(point, draggedPanelId, geometry)
  if (gapTarget) {
    return {
      type: "gap",
      target: gapTarget,
    }
  }

  const centerTargetId = getPanelSwapTargetFromPoint(point, draggedPanelId, geometry)
  if (centerTargetId) {
    return {
      type: "swap",
      targetId: centerTargetId,
    }
  }

  const panel = element.closest("[data-tool-panel]")
  if (!(panel instanceof HTMLElement)) {
    return null
  }

  const targetId = panel.dataset.toolPanel
  if (!isPanelId(targetId) || targetId === draggedPanelId) {
    return null
  }

  return {
    type: "swap",
    targetId,
  }
}

function getSplitGroupSlotTargetFromPoint(
  point: DragPoint,
  draggedPanelId: PanelId,
  geometry: DragTargetGeometry | null,
): SplitGroupSlotTarget | null {
  const groups = geometry?.groups ?? captureDragTargetGeometry().groups
  let nearest:
    | {
        score: number
        target: SplitGroupSlotTarget
      }
    | null = null

  for (const group of groups) {
    if (group.path.length === 0 || group.panelIds.every((panelId) => panelId === draggedPanelId)) {
      continue
    }

    const rect = group.rect
    if (rect.width <= 0 || rect.height <= 0) {
      continue
    }

    for (const side of DROP_SIDES) {
      const distance = getDistanceToRectSide(point, side, rect)
      if (distance > PANEL_GROUP_SLOT_EDGE_ZONE_PX) {
        continue
      }

      if (!isWithinRectSideCrossAxis(point, side, rect, PANEL_GROUP_SLOT_CROSS_AXIS_MARGIN_PX)) {
        continue
      }

      const depthBias = group.path.length * 6
      const score = distance - depthBias
      if (!nearest || score < nearest.score) {
        nearest = {
          score,
          target: {
            pathKey: group.pathKey,
            path: group.path,
            side,
          },
        }
      }
    }
  }

  return nearest?.target ?? null
}

function getPanelSlotTargetFromPoint(
  point: DragPoint,
  draggedPanelId: PanelId,
  geometry: DragTargetGeometry | null,
): PanelSlotTarget | null {
  const panelTargets = geometry?.panels ?? captureDragTargetGeometry().panels
  let nearest:
    | {
        distance: number
        target: PanelSlotTarget
      }
    | null = null

  for (const panel of panelTargets) {
    if (panel.panelId === draggedPanelId) {
      continue
    }

    const rect = panel.rect
    if (
      point.clientX < rect.left ||
      point.clientX > rect.right ||
      point.clientY < rect.top ||
      point.clientY > rect.bottom
    ) {
      continue
    }

    const zoneHeight = Math.max(0, Math.min(PANEL_SLOT_EDGE_ZONE_PX, rect.height / 3))
    if (zoneHeight <= 0) {
      continue
    }

    const topDistance = point.clientY - rect.top
    const bottomDistance = rect.bottom - point.clientY
    const side = topDistance <= bottomDistance ? "top" : "bottom"
    const distance = Math.min(topDistance, bottomDistance)
    if (distance > zoneHeight) {
      continue
    }

    if (!nearest || distance < nearest.distance) {
      nearest = {
        distance,
        target: {
          targetId: panel.panelId,
          side,
        },
      }
    }
  }

  return nearest?.target ?? null
}

function getEquivalentVerticalGapTarget(
  panelSlotTarget: PanelSlotTarget,
  geometry: DragTargetGeometry | null,
): SplitGapTarget | null {
  const gaps = geometry?.gaps ?? captureDragTargetGeometry().gaps

  for (const gap of gaps) {
    const { target } = gap
    if (target.direction !== "column") {
      continue
    }

    if (panelSlotTarget.side === "bottom" && target.beforeId === panelSlotTarget.targetId) {
      return target
    }

    if (panelSlotTarget.side === "top" && target.afterId === panelSlotTarget.targetId) {
      return target
    }
  }

  return null
}

function getEquivalentGroupGapTarget(
  groupSlotTarget: SplitGroupSlotTarget,
  geometry: DragTargetGeometry | null,
): SplitGapTarget | null {
  const groups = geometry?.groups ?? captureDragTargetGeometry().groups
  const group = groups.find((candidate) => candidate.pathKey === groupSlotTarget.pathKey)
  if (!group) {
    return null
  }

  const gapDirection: SplitDirection =
    groupSlotTarget.side === "left" || groupSlotTarget.side === "right" ? "row" : "column"
  const boundaryPanelId =
    groupSlotTarget.side === "left" || groupSlotTarget.side === "top"
      ? group.panelIds[0]
      : group.panelIds.at(-1)
  if (!boundaryPanelId) {
    return null
  }

  const gaps = geometry?.gaps ?? captureDragTargetGeometry().gaps
  for (const gap of gaps) {
    const { target } = gap
    if (target.direction !== gapDirection) {
      continue
    }

    if ((groupSlotTarget.side === "left" || groupSlotTarget.side === "top") && target.afterId === boundaryPanelId) {
      return target
    }

    if ((groupSlotTarget.side === "right" || groupSlotTarget.side === "bottom") && target.beforeId === boundaryPanelId) {
      return target
    }
  }

  return null
}

function getWorkspaceEdgeDropTarget(
  point: DragPoint,
  _draggedPanelId: PanelId,
  geometry: DragTargetGeometry | null,
): ActivePanelDrop | null {
  const edges = geometry?.edges ?? captureDragTargetGeometry().edges
  let nearest:
    | {
        distance: number
        side: WorkspaceEdgeSide
      }
    | null = null

  for (const edge of edges) {
    const { rect } = edge
    if (
      point.clientX < rect.left ||
      point.clientX > rect.right ||
      point.clientY < rect.top ||
      point.clientY > rect.bottom
    ) {
      continue
    }

    const distance = getDistanceToWorkspaceEdge(point, edge.side, rect)
    if (!nearest || distance < nearest.distance) {
      nearest = {
        distance,
        side: edge.side,
      }
    }
  }

  return nearest ? { type: "edge", side: nearest.side } : null
}

function getDistanceToWorkspaceEdge(
  point: DragPoint,
  side: WorkspaceEdgeSide,
  rect: MeasuredRect,
): number {
  if (side === "left") {
    return Math.abs(point.clientX - rect.left)
  }

  if (side === "right") {
    return Math.abs(point.clientX - rect.right)
  }

  if (side === "top") {
    return Math.abs(point.clientY - rect.top)
  }

  return Math.abs(point.clientY - rect.bottom)
}

function getDistanceToRectSide(point: DragPoint, side: DropSide, rect: MeasuredRect): number {
  if (side === "left") {
    return Math.abs(point.clientX - rect.left)
  }

  if (side === "right") {
    return Math.abs(point.clientX - rect.right)
  }

  if (side === "top") {
    return Math.abs(point.clientY - rect.top)
  }

  return Math.abs(point.clientY - rect.bottom)
}

function isWithinRectSideCrossAxis(
  point: DragPoint,
  side: DropSide,
  rect: MeasuredRect,
  margin: number,
): boolean {
  if (side === "left" || side === "right") {
    return point.clientY >= rect.top - margin && point.clientY <= rect.bottom + margin
  }

  return point.clientX >= rect.left - margin && point.clientX <= rect.right + margin
}

function getGapEndpointDropTargetFromPoint(
  point: DragPoint,
  draggedPanelId: PanelId,
  geometry: DragTargetGeometry | null,
): ActivePanelDrop | null {
  const currentGeometry = geometry ?? captureDragTargetGeometry()
  let nearest:
    | {
        distance: number
        target: ActivePanelDrop
      }
    | null = null

  for (const gap of currentGeometry.gaps) {
    const { target, rect } = gap
    if (
      !target.beforeId ||
      !target.afterId ||
      target.beforeId === draggedPanelId ||
      target.afterId === draggedPanelId ||
      currentGeometry.panels.length <= 2
    ) {
      continue
    }

    const pairRect = getPanelPairRect(currentGeometry, target.beforeId, target.afterId)
    if (!pairRect) {
      continue
    }

    const isRowGap = target.direction === "row"
    const axisPosition = isRowGap ? point.clientX : point.clientY
    const crossAxisPosition = isRowGap ? point.clientY : point.clientX
    const axisStart = isRowGap ? rect.left : rect.top
    const axisEnd = isRowGap ? rect.right : rect.bottom
    const crossAxisStart = isRowGap ? pairRect.top : pairRect.left
    const crossAxisEnd = isRowGap ? pairRect.bottom : pairRect.right

    if (
      axisPosition < axisStart - PANEL_GAP_ENDPOINT_AXIS_MARGIN_PX ||
      axisPosition > axisEnd + PANEL_GAP_ENDPOINT_AXIS_MARGIN_PX
    ) {
      continue
    }

    const startDistance = crossAxisPosition - crossAxisStart
    const endDistance = crossAxisEnd - crossAxisPosition
    const endpointCandidates = [
      {
        distance: Math.abs(startDistance),
        inZone: startDistance >= 0 && startDistance <= PANEL_GAP_ENDPOINT_ZONE_PX,
        side: isRowGap ? "top" : "left",
      },
      {
        distance: Math.abs(endDistance),
        inZone: endDistance >= 0 && endDistance <= PANEL_GAP_ENDPOINT_ZONE_PX,
        side: isRowGap ? "bottom" : "right",
      },
    ] satisfies Array<{ distance: number; inZone: boolean; side: DropSide }>

    for (const candidate of endpointCandidates) {
      if (!candidate.inZone) {
        continue
      }

      const exactGroup = findExactPanelGroup(currentGeometry, [target.beforeId, target.afterId])
      const dropTarget: ActivePanelDrop = exactGroup
        ? {
            type: "group-slot",
            target: {
              pathKey: exactGroup.pathKey,
              path: exactGroup.path,
              side: candidate.side,
            },
          }
        : {
            type: "pair-slot",
            target: {
              beforeId: target.beforeId,
              afterId: target.afterId,
              side: candidate.side,
              rect: pairRect,
            },
          }

      if (!nearest || candidate.distance < nearest.distance) {
        nearest = {
          distance: candidate.distance,
          target: dropTarget,
        }
      }
    }
  }

  return nearest?.target ?? null
}

function getPanelPairRect(
  geometry: DragTargetGeometry,
  beforeId: PanelId,
  afterId: PanelId,
): MeasuredRect | null {
  const beforePanel = geometry.panels.find((panel) => panel.panelId === beforeId)
  const afterPanel = geometry.panels.find((panel) => panel.panelId === afterId)
  if (!beforePanel || !afterPanel) {
    return null
  }

  return getUnionRect([beforePanel.rect, afterPanel.rect])
}

function getUnionRect(rects: MeasuredRect[]): MeasuredRect {
  const left = Math.min(...rects.map((rect) => rect.left))
  const right = Math.max(...rects.map((rect) => rect.right))
  const top = Math.min(...rects.map((rect) => rect.top))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  }
}

function findExactPanelGroup(
  geometry: DragTargetGeometry,
  panelIds: PanelId[],
): DragTargetGeometry["groups"][number] | null {
  const expected = new Set(panelIds)
  return (
    geometry.groups.find(
      (group) =>
        group.panelIds.length === expected.size &&
        group.panelIds.every((panelId) => expected.has(panelId)),
    ) ?? null
  )
}

function getPhysicalGapTargetFromPoint(
  point: DragPoint,
  draggedPanelId: PanelId,
  geometry: DragTargetGeometry | null,
): SplitGapTarget | null {
  const gaps = geometry?.gaps ?? captureDragTargetGeometry().gaps
  let nearest:
    | {
        distance: number
        target: SplitGapTarget
      }
    | null = null

  for (const gap of gaps) {
    const { target, rect } = gap
    const isRow = target.direction === "row"
    const axisPosition = isRow ? point.clientX : point.clientY
    const crossAxisPosition = isRow ? point.clientY : point.clientX
    const axisStart = isRow ? rect.left : rect.top
    const axisEnd = isRow ? rect.right : rect.bottom
    const crossAxisStart = isRow ? rect.top : rect.left
    const crossAxisEnd = isRow ? rect.bottom : rect.right
    const crossAxisSize = Math.max(0, crossAxisEnd - crossAxisStart)
    const endGuard = Math.min(PANEL_PHYSICAL_GAP_END_GUARD_PX, crossAxisSize / 3)

    if (
      axisPosition < axisStart - PANEL_PHYSICAL_GAP_AXIS_MARGIN_PX ||
      axisPosition > axisEnd + PANEL_PHYSICAL_GAP_AXIS_MARGIN_PX
    ) {
      continue
    }

    if (
      crossAxisPosition < crossAxisStart - PANEL_PHYSICAL_GAP_CROSS_AXIS_MARGIN_PX ||
      crossAxisPosition > crossAxisEnd + PANEL_PHYSICAL_GAP_CROSS_AXIS_MARGIN_PX
    ) {
      continue
    }

    if (crossAxisPosition < crossAxisStart + endGuard || crossAxisPosition > crossAxisEnd - endGuard) {
      continue
    }

    const nearestPanelCenterDistance = getNearestAdjacentPanelCenterDistance(
      point,
      target,
      draggedPanelId,
      geometry,
    )
    if (!nearestPanelCenterDistance || nearestPanelCenterDistance <= 0) {
      continue
    }

    const axisCenter = axisStart + (axisEnd - axisStart) / 2
    const distance = Math.abs(axisPosition - axisCenter)
    if (!nearest || distance < nearest.distance) {
      nearest = {
        distance,
        target,
      }
    }
  }

  return nearest?.target ?? null
}

function getNearestGapTarget(
  point: DragPoint,
  draggedPanelId: PanelId,
  geometry: DragTargetGeometry | null,
): SplitGapTarget | null {
  const gaps = geometry?.gaps ?? captureDragTargetGeometry().gaps
  let nearest:
    | {
        score: number
        target: SplitGapTarget
      }
    | null = null

  for (const gap of gaps) {
    const { target, rect } = gap
    const isRow = target.direction === "row"
    const axisPosition = isRow ? point.clientX : point.clientY
    const crossAxisPosition = isRow ? point.clientY : point.clientX
    const axisCenter = isRow ? rect.left + rect.width / 2 : rect.top + rect.height / 2
    const crossAxisStart = isRow ? rect.top : rect.left
    const crossAxisEnd = isRow ? rect.bottom : rect.right

    if (
      crossAxisPosition < crossAxisStart - PANEL_GAP_CROSS_AXIS_MARGIN_PX ||
      crossAxisPosition > crossAxisEnd + PANEL_GAP_CROSS_AXIS_MARGIN_PX
    ) {
      continue
    }

    const nearestPanelCenterDistance = getNearestAdjacentPanelCenterDistance(
      point,
      target,
      draggedPanelId,
      geometry,
    )
    if (!nearestPanelCenterDistance || nearestPanelCenterDistance <= 0) {
      continue
    }

    const gapDistance = Math.abs(axisPosition - axisCenter)
    if (
      gapDistance > PANEL_GAP_AXIS_ZONE_PX ||
      gapDistance > nearestPanelCenterDistance - PANEL_GAP_CENTER_BIAS_PX
    ) {
      continue
    }

    const score = gapDistance / nearestPanelCenterDistance
    if (!nearest || score < nearest.score) {
      nearest = {
        score,
        target,
      }
    }
  }

  return nearest?.target ?? null
}

function getPanelSwapTargetFromPoint(
  point: DragPoint,
  draggedPanelId: PanelId,
  geometry: DragTargetGeometry | null,
): PanelId | null {
  const panelTargets = geometry?.panels ?? captureDragTargetGeometry().panels
  const candidates = panelTargets.flatMap((panel) => {
    if (panel.panelId === draggedPanelId) {
      return []
    }

    const rect = panel.rect
    if (
      point.clientX < rect.left ||
      point.clientX > rect.right ||
      point.clientY < rect.top ||
      point.clientY > rect.bottom
    ) {
      return []
    }

    return [
      {
        panelId: panel.panelId,
        distance: Math.hypot(point.clientX - panel.centerX, point.clientY - panel.centerY),
      },
    ]
  })

  candidates.sort((first, second) => first.distance - second.distance)
  return candidates[0]?.panelId ?? null
}

function readGapTarget(gap: HTMLElement): SplitGapTarget | null {
  const pathKey = gap.dataset.panelGapPath
  const direction = gap.dataset.panelGapDirection
  if (!pathKey || (direction !== "row" && direction !== "column")) {
    return null
  }

  return {
    pathKey,
    direction,
    beforeId: isPanelId(gap.dataset.panelGapBefore) ? gap.dataset.panelGapBefore : null,
    afterId: isPanelId(gap.dataset.panelGapAfter) ? gap.dataset.panelGapAfter : null,
  }
}

function getNearestAdjacentPanelCenterDistance(
  point: DragPoint,
  target: SplitGapTarget,
  draggedPanelId: PanelId,
  geometry: DragTargetGeometry | null,
): number | null {
  const isRow = target.direction === "row"
  const axisPosition = isRow ? point.clientX : point.clientY
  const panels = geometry?.panels ?? captureDragTargetGeometry().panels
  const distances = [target.beforeId, target.afterId].flatMap((panelId) => {
    if (!panelId || panelId === draggedPanelId) {
      return []
    }

    const panel = panels.find((candidate) => candidate.panelId === panelId)
    if (!panel) {
      return []
    }

    const panelCenter = isRow ? panel.centerX : panel.centerY
    return [Math.abs(axisPosition - panelCenter)]
  })

  if (distances.length === 0) {
    return null
  }

  return Math.min(...distances)
}

function animatePanelPreview(node: HTMLElement, initialTransform: string) {
  node.getAnimations?.().forEach((animation) => animation.cancel())
  if (typeof node.animate === "function") {
    node.animate(
      [
        {
          transform: initialTransform,
          transformOrigin: "top left",
        },
        { transform: "translate(0, 0)" },
      ],
      {
        duration: PANEL_PREVIEW_ANIMATION_MS,
        easing: PANEL_PREVIEW_EASING,
      },
    )
    return
  }

  const animationToken = `${Date.now()}-${Math.random()}`
  node.dataset.panelPreviewAnimation = animationToken
  node.style.transition = "none"
  node.style.transformOrigin = "top left"
  node.style.transform = initialTransform
  node.getBoundingClientRect()

  window.requestAnimationFrame(() => {
    if (node.dataset.panelPreviewAnimation !== animationToken) {
      return
    }
    node.style.transition = `transform ${PANEL_PREVIEW_ANIMATION_MS}ms ${PANEL_PREVIEW_EASING}`
    node.style.transform = "translate(0, 0)"
  })

  window.setTimeout(() => {
    if (node.dataset.panelPreviewAnimation !== animationToken) {
      return
    }
    delete node.dataset.panelPreviewAnimation
    node.style.transition = ""
    node.style.transform = ""
    node.style.transformOrigin = ""
  }, PANEL_PREVIEW_ANIMATION_MS + 40)
}
