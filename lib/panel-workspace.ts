export const PANEL_IDS = ["panel1", "panel2", "panel3"] as const

export type PanelId = (typeof PANEL_IDS)[number]
export type SplitDirection = "row" | "column"
export type DropSide = "left" | "right" | "top" | "bottom"
export type WorkspaceEdgeSide = DropSide
export type SplitPathSegment = "first" | "second"
export type SplitPath = SplitPathSegment[]

export type PanelLayoutNode =
  | {
      type: "panel"
      id: PanelId
    }
  | {
      type: "split"
      direction: SplitDirection
      ratio: number
      first: PanelLayoutNode
      second: PanelLayoutNode
    }

export type PanelWorkspaceState = {
  layout: PanelLayoutNode | null
  collapsed: PanelId[]
}

const PANEL_ID_SET = new Set<string>(PANEL_IDS)
const MIN_SPLIT_RATIO = 0.05
const MAX_SPLIT_RATIO = 0.95
const DEFAULT_INSERT_RATIO = 0.5
const DEFAULT_EDGE_INSERT_RATIO = 0.28

export function createDefaultPanelWorkspaceState(): PanelWorkspaceState {
  return {
    layout: {
      type: "split",
      direction: "row",
      ratio: 0.28,
      first: { type: "panel", id: "panel1" },
      second: {
        type: "split",
        direction: "column",
        ratio: 0.56,
        first: { type: "panel", id: "panel2" },
        second: { type: "panel", id: "panel3" },
      },
    },
    collapsed: [],
  }
}

export function isPanelId(value: unknown): value is PanelId {
  return typeof value === "string" && PANEL_ID_SET.has(value)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function clampSplitRatio(ratio: number): number {
  return Number.isFinite(ratio) ? clamp(ratio, MIN_SPLIT_RATIO, MAX_SPLIT_RATIO) : DEFAULT_INSERT_RATIO
}

export function getPanelIds(layout: PanelLayoutNode | null): PanelId[] {
  if (!layout) {
    return []
  }
  if (layout.type === "panel") {
    return [layout.id]
  }
  return [...getPanelIds(layout.first), ...getPanelIds(layout.second)]
}

export function containsPanel(layout: PanelLayoutNode | null, panelId: PanelId): boolean {
  if (!layout) {
    return false
  }
  if (layout.type === "panel") {
    return layout.id === panelId
  }
  return containsPanel(layout.first, panelId) || containsPanel(layout.second, panelId)
}

export function removePanelFromLayout(layout: PanelLayoutNode | null, panelId: PanelId): PanelLayoutNode | null {
  if (!layout) {
    return null
  }
  if (layout.type === "panel") {
    return layout.id === panelId ? null : layout
  }

  const first = removePanelFromLayout(layout.first, panelId)
  const second = removePanelFromLayout(layout.second, panelId)

  if (!first && !second) {
    return null
  }
  if (!first) {
    return second
  }
  if (!second) {
    return first
  }

  return {
    ...layout,
    first,
    second,
  }
}

export function insertPanelNearTarget(
  layout: PanelLayoutNode | null,
  panelId: PanelId,
  targetId: PanelId,
  side: DropSide,
): PanelLayoutNode {
  const panelNode: PanelLayoutNode = { type: "panel", id: panelId }

  if (!layout) {
    return panelNode
  }

  if (layout.type === "panel") {
    if (layout.id !== targetId) {
      return layout
    }

    const direction: SplitDirection = side === "left" || side === "right" ? "row" : "column"
    const draggedFirst = side === "left" || side === "top"
    return {
      type: "split",
      direction,
      ratio: DEFAULT_INSERT_RATIO,
      first: draggedFirst ? panelNode : layout,
      second: draggedFirst ? layout : panelNode,
    }
  }

  if (containsPanel(layout.first, targetId)) {
    return {
      ...layout,
      first: insertPanelNearTarget(layout.first, panelId, targetId, side),
    }
  }

  if (containsPanel(layout.second, targetId)) {
    return {
      ...layout,
      second: insertPanelNearTarget(layout.second, panelId, targetId, side),
    }
  }

  return layout
}

export function movePanelInWorkspace(
  state: PanelWorkspaceState,
  panelId: PanelId,
  targetId: PanelId,
  side: DropSide,
): PanelWorkspaceState {
  if (panelId === targetId) {
    return state
  }

  const layoutWithoutPanel = containsPanel(state.layout, panelId)
    ? removePanelFromLayout(state.layout, panelId)
    : state.layout

  if (!containsPanel(layoutWithoutPanel, targetId)) {
    return state
  }

  return {
    layout: insertPanelNearTarget(layoutWithoutPanel, panelId, targetId, side),
    collapsed: state.collapsed.filter((id) => id !== panelId),
  }
}

export function movePanelToWorkspaceEdge(
  state: PanelWorkspaceState,
  panelId: PanelId,
  side: WorkspaceEdgeSide,
): PanelWorkspaceState {
  const panelNode: PanelLayoutNode = { type: "panel", id: panelId }
  const layoutWithoutPanel = containsPanel(state.layout, panelId)
    ? removePanelFromLayout(state.layout, panelId)
    : state.layout

  if (!layoutWithoutPanel) {
    return {
      layout: panelNode,
      collapsed: state.collapsed.filter((id) => id !== panelId),
    }
  }

  const direction: SplitDirection = side === "left" || side === "right" ? "row" : "column"
  const draggedFirst = side === "left" || side === "top"
  return {
    layout: {
      type: "split",
      direction,
      ratio: draggedFirst ? DEFAULT_EDGE_INSERT_RATIO : 1 - DEFAULT_EDGE_INSERT_RATIO,
      first: draggedFirst ? panelNode : layoutWithoutPanel,
      second: draggedFirst ? layoutWithoutPanel : panelNode,
    },
    collapsed: state.collapsed.filter((id) => id !== panelId),
  }
}

export function swapPanelsInWorkspace(
  state: PanelWorkspaceState,
  panelId: PanelId,
  targetId: PanelId,
): PanelWorkspaceState {
  if (panelId === targetId) {
    return state
  }

  const panelVisible = containsPanel(state.layout, panelId)
  const targetVisible = containsPanel(state.layout, targetId)
  const panelCollapsed = state.collapsed.includes(panelId)
  const targetCollapsed = state.collapsed.includes(targetId)

  if (panelVisible && targetVisible) {
    return {
      ...state,
      layout: replacePanelIds(state.layout, (id) => {
        if (id === panelId) return targetId
        if (id === targetId) return panelId
        return id
      }),
    }
  }

  if (panelCollapsed && targetVisible) {
    return {
      layout: replacePanelIds(state.layout, (id) => (id === targetId ? panelId : id)),
      collapsed: [...state.collapsed.filter((id) => id !== panelId && id !== targetId), targetId],
    }
  }

  if (panelVisible && targetCollapsed) {
    return {
      layout: replacePanelIds(state.layout, (id) => (id === panelId ? targetId : id)),
      collapsed: [...state.collapsed.filter((id) => id !== panelId && id !== targetId), panelId],
    }
  }

  return state
}

export function collapsePanelInWorkspace(state: PanelWorkspaceState, panelId: PanelId): PanelWorkspaceState {
  if (!containsPanel(state.layout, panelId)) {
    return state
  }

  const collapsed = state.collapsed.includes(panelId) ? state.collapsed : [...state.collapsed, panelId]
  return {
    layout: removePanelFromLayout(state.layout, panelId),
    collapsed,
  }
}

export function restorePanelInWorkspace(state: PanelWorkspaceState, panelId: PanelId): PanelWorkspaceState {
  if (containsPanel(state.layout, panelId)) {
    return state
  }

  const panelNode: PanelLayoutNode = { type: "panel", id: panelId }
  const nextLayout: PanelLayoutNode = state.layout
    ? {
        type: "split",
        direction: "row",
        ratio: 0.72,
        first: state.layout,
        second: panelNode,
      }
    : panelNode

  return {
    layout: nextLayout,
    collapsed: state.collapsed.filter((id) => id !== panelId),
  }
}

export function updateSplitRatio(
  layout: PanelLayoutNode | null,
  path: SplitPath,
  ratio: number,
): PanelLayoutNode | null {
  if (!layout || layout.type !== "split") {
    return layout
  }

  const [head, ...tail] = path
  if (!head) {
    return {
      ...layout,
      ratio: clampSplitRatio(ratio),
    }
  }

  return {
    ...layout,
    [head]: updateSplitRatio(layout[head], tail, ratio) ?? layout[head],
  }
}

export function getSplitRatioAtPath(layout: PanelLayoutNode | null, path: SplitPath): number | null {
  if (!layout || layout.type !== "split") {
    return null
  }

  const [head, ...tail] = path
  if (!head) {
    return layout.ratio
  }

  return getSplitRatioAtPath(layout[head], tail)
}

export function normalizePanelWorkspaceState(value: unknown): PanelWorkspaceState | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const candidate = value as Partial<Record<keyof PanelWorkspaceState, unknown>>
  if (!("layout" in candidate) && !("collapsed" in candidate)) {
    return null
  }

  const seen = new Set<PanelId>()
  let layout = normalizePanelLayoutNode(candidate.layout, seen)
  const collapsed = Array.isArray(candidate.collapsed)
    ? candidate.collapsed.filter((id): id is PanelId => isPanelId(id) && !seen.has(id))
    : []
  const uniqueCollapsed = Array.from(new Set(collapsed))

  const represented = new Set<PanelId>([...seen, ...uniqueCollapsed])
  for (const panelId of PANEL_IDS) {
    if (!represented.has(panelId)) {
      layout = appendPanelToLayout(layout, panelId)
      represented.add(panelId)
    }
  }

  if (!layout && uniqueCollapsed.length === 0) {
    return null
  }

  return {
    layout,
    collapsed: uniqueCollapsed,
  }
}

function replacePanelIds(
  layout: PanelLayoutNode | null,
  mapper: (panelId: PanelId) => PanelId,
): PanelLayoutNode | null {
  if (!layout) {
    return null
  }
  if (layout.type === "panel") {
    return {
      ...layout,
      id: mapper(layout.id),
    }
  }
  return {
    ...layout,
    first: replacePanelIds(layout.first, mapper) ?? layout.first,
    second: replacePanelIds(layout.second, mapper) ?? layout.second,
  }
}

function normalizePanelLayoutNode(value: unknown, seen: Set<PanelId>): PanelLayoutNode | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const candidate = value as Record<string, unknown>
  if (candidate.type === "panel") {
    if (!isPanelId(candidate.id) || seen.has(candidate.id)) {
      return null
    }
    seen.add(candidate.id)
    return {
      type: "panel",
      id: candidate.id,
    }
  }

  if (candidate.type !== "split") {
    return null
  }

  const first = normalizePanelLayoutNode(candidate.first, seen)
  const second = normalizePanelLayoutNode(candidate.second, seen)

  if (!first && !second) {
    return null
  }
  if (!first) {
    return second
  }
  if (!second) {
    return first
  }

  const direction: SplitDirection = candidate.direction === "column" ? "column" : "row"
  const ratio = typeof candidate.ratio === "number" ? candidate.ratio : DEFAULT_INSERT_RATIO

  return {
    type: "split",
    direction,
    ratio: clampSplitRatio(ratio),
    first,
    second,
  }
}

function appendPanelToLayout(layout: PanelLayoutNode | null, panelId: PanelId): PanelLayoutNode {
  const panelNode: PanelLayoutNode = { type: "panel", id: panelId }
  if (!layout) {
    return panelNode
  }

  return {
    type: "split",
    direction: "row",
    ratio: 0.72,
    first: layout,
    second: panelNode,
  }
}
