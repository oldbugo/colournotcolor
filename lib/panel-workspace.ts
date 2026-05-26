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

export type SplitResizeSession = {
  direction: SplitDirection
  groupPath: SplitPath
  gapIndex: number
  itemSizes: number[]
  minItemSizes: number[]
  splitterSize: number
}

export type SplitResizeResult = {
  session: SplitResizeSession
  appliedDelta: number
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

export function movePanelToLayoutPathSide(
  state: PanelWorkspaceState,
  panelId: PanelId,
  targetPath: SplitPath,
  side: DropSide,
): PanelWorkspaceState {
  const targetNode = getNodeAtPath(state.layout, targetPath)
  if (!targetNode) {
    return state
  }

  const targetPanelIds = getPanelIds(targetNode).filter((id) => id !== panelId)
  if (targetPanelIds.length === 0) {
    return state
  }

  const layoutWithoutPanel = containsPanel(state.layout, panelId)
    ? removePanelFromLayout(state.layout, panelId)
    : state.layout
  const adjustedTargetPath = findSmallestNodePathContainingPanels(layoutWithoutPanel, targetPanelIds)
  if (!adjustedTargetPath) {
    return state
  }

  return {
    layout: insertPanelNearPath(layoutWithoutPanel, panelId, adjustedTargetPath, side),
    collapsed: state.collapsed.filter((id) => id !== panelId),
  }
}

export function insertPanelNearPath(
  layout: PanelLayoutNode | null,
  panelId: PanelId,
  targetPath: SplitPath,
  side: DropSide,
): PanelLayoutNode {
  const panelNode: PanelLayoutNode = { type: "panel", id: panelId }
  if (!layout) {
    return panelNode
  }

  if (targetPath.length === 0) {
    const direction: SplitDirection = side === "left" || side === "right" ? "row" : "column"
    const draggedFirst = side === "left" || side === "top"
    return {
      type: "split",
      direction,
      ratio: draggedFirst ? DEFAULT_EDGE_INSERT_RATIO : 1 - DEFAULT_EDGE_INSERT_RATIO,
      first: draggedFirst ? panelNode : layout,
      second: draggedFirst ? layout : panelNode,
    }
  }

  if (layout.type !== "split") {
    return layout
  }

  const [head, ...tail] = targetPath
  return {
    ...layout,
    [head]: insertPanelNearPath(layout[head], panelId, tail, side),
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

export function getPanelLayoutMinSize(
  layout: PanelLayoutNode | null,
  direction: SplitDirection,
  minPanelSize: number,
  splitterSize: number,
): number {
  if (!layout) {
    return 0
  }

  if (layout.type === "panel") {
    return minPanelSize
  }

  const firstMinSize = getPanelLayoutMinSize(layout.first, direction, minPanelSize, splitterSize)
  const secondMinSize = getPanelLayoutMinSize(layout.second, direction, minPanelSize, splitterSize)

  if (layout.direction === direction) {
    return firstMinSize + secondMinSize + splitterSize
  }

  return Math.max(firstMinSize, secondMinSize)
}

export function getSplitResizeGroupPath(
  layout: PanelLayoutNode | null,
  path: SplitPath,
  direction: SplitDirection,
): SplitPath | null {
  const splitNode = getNodeAtPath(layout, path)
  if (!splitNode || splitNode.type !== "split" || splitNode.direction !== direction) {
    return null
  }

  let groupPath = path
  for (let pathLength = path.length - 1; pathLength >= 0; pathLength -= 1) {
    const parentPath = path.slice(0, pathLength)
    const parentNode = getNodeAtPath(layout, parentPath)
    if (!parentNode || parentNode.type !== "split" || parentNode.direction !== direction) {
      break
    }
    groupPath = parentPath
  }

  return groupPath
}

export function createSplitResizeSession(
  layout: PanelLayoutNode | null,
  path: SplitPath,
  direction: SplitDirection,
  groupAxisSize: number,
  minPanelSize: number,
  splitterSize: number,
): SplitResizeSession | null {
  if (!layout || groupAxisSize <= 0 || minPanelSize < 0 || splitterSize < 0) {
    return null
  }

  const groupPath = getSplitResizeGroupPath(layout, path, direction)
  if (!groupPath) {
    return null
  }

  const groupNode = getNodeAtPath(layout, groupPath)
  if (!groupNode || groupNode.type !== "split" || groupNode.direction !== direction) {
    return null
  }

  const relativePath = path.slice(groupPath.length)
  const gapIndex = getSplitGapIndex(groupNode, relativePath, direction)
  const itemSizes = getAxisItemSizes(groupNode, direction, groupAxisSize, splitterSize)
  const minItemSizes = getAxisItemMinSizes(groupNode, direction, minPanelSize, splitterSize)

  if (gapIndex === null || gapIndex <= 0 || gapIndex >= itemSizes.length || itemSizes.length !== minItemSizes.length) {
    return null
  }

  return {
    direction,
    groupPath,
    gapIndex,
    itemSizes,
    minItemSizes,
    splitterSize,
  }
}

export function resizeSplitLayoutFromSession(
  layout: PanelLayoutNode | null,
  session: SplitResizeSession,
  delta: number,
): PanelLayoutNode | null {
  if (!layout || !Number.isFinite(delta)) {
    return layout
  }

  const { session: resizedSession } = resizeSplitSession(session, delta)
  return applySplitResizeSession(layout, resizedSession)
}

export function resizeSplitSession(session: SplitResizeSession, delta: number): SplitResizeResult {
  if (!Number.isFinite(delta) || delta === 0) {
    return {
      session,
      appliedDelta: 0,
    }
  }

  const { itemSizes, appliedDelta } = resizeAxisItemSizes(
    session.itemSizes,
    session.minItemSizes,
    session.gapIndex,
    delta,
  )

  return {
    session: {
      ...session,
      itemSizes,
    },
    appliedDelta,
  }
}

export function applySplitResizeSession(
  layout: PanelLayoutNode | null,
  session: SplitResizeSession,
): PanelLayoutNode | null {
  if (!layout) {
    return layout
  }

  return updateNodeAtPath(layout, session.groupPath, (node) =>
    applyAxisItemSizes(node, session.direction, session.itemSizes, session.splitterSize),
  )
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

function getNodeAtPath(layout: PanelLayoutNode | null, path: SplitPath): PanelLayoutNode | null {
  let node = layout
  for (const segment of path) {
    if (!node || node.type !== "split") {
      return null
    }
    node = node[segment]
  }
  return node
}

function findSmallestNodePathContainingPanels(
  layout: PanelLayoutNode | null,
  panelIds: PanelId[],
): SplitPath | null {
  if (!layout || !containsEveryPanel(layout, panelIds)) {
    return null
  }

  if (layout.type === "panel") {
    return []
  }

  const firstPath = findSmallestNodePathContainingPanels(layout.first, panelIds)
  if (firstPath) {
    return ["first", ...firstPath]
  }

  const secondPath = findSmallestNodePathContainingPanels(layout.second, panelIds)
  if (secondPath) {
    return ["second", ...secondPath]
  }

  return []
}

function containsEveryPanel(layout: PanelLayoutNode | null, panelIds: PanelId[]): boolean {
  return panelIds.every((panelId) => containsPanel(layout, panelId))
}

function updateNodeAtPath(
  layout: PanelLayoutNode | null,
  path: SplitPath,
  updater: (node: PanelLayoutNode) => PanelLayoutNode,
): PanelLayoutNode | null {
  if (!layout) {
    return null
  }

  if (path.length === 0) {
    return updater(layout)
  }

  if (layout.type !== "split") {
    return layout
  }

  const [head, ...tail] = path
  return {
    ...layout,
    [head]: updateNodeAtPath(layout[head], tail, updater) ?? layout[head],
  }
}

function countAxisItems(layout: PanelLayoutNode, direction: SplitDirection): number {
  if (layout.type === "split" && layout.direction === direction) {
    return countAxisItems(layout.first, direction) + countAxisItems(layout.second, direction)
  }

  return 1
}

function getAxisItemSizes(
  layout: PanelLayoutNode,
  direction: SplitDirection,
  axisSize: number,
  splitterSize: number,
): number[] {
  if (layout.type !== "split" || layout.direction !== direction) {
    return [Math.max(0, axisSize)]
  }

  const availableSize = Math.max(0, axisSize - splitterSize)
  const firstSize = clamp(layout.ratio, 0, 1) * availableSize
  const secondSize = Math.max(0, availableSize - firstSize)
  return [
    ...getAxisItemSizes(layout.first, direction, firstSize, splitterSize),
    ...getAxisItemSizes(layout.second, direction, secondSize, splitterSize),
  ]
}

function getAxisItemMinSizes(
  layout: PanelLayoutNode,
  direction: SplitDirection,
  minPanelSize: number,
  splitterSize: number,
): number[] {
  if (layout.type !== "split" || layout.direction !== direction) {
    return [getPanelLayoutMinSize(layout, direction, minPanelSize, splitterSize)]
  }

  return [
    ...getAxisItemMinSizes(layout.first, direction, minPanelSize, splitterSize),
    ...getAxisItemMinSizes(layout.second, direction, minPanelSize, splitterSize),
  ]
}

function getSplitGapIndex(
  layout: PanelLayoutNode,
  path: SplitPath,
  direction: SplitDirection,
): number | null {
  if (layout.type !== "split" || layout.direction !== direction) {
    return null
  }

  if (path.length === 0) {
    return countAxisItems(layout.first, direction)
  }

  const [head, ...tail] = path
  if (head === "first") {
    return getSplitGapIndex(layout.first, tail, direction)
  }

  const nestedGapIndex = getSplitGapIndex(layout.second, tail, direction)
  return nestedGapIndex === null ? null : countAxisItems(layout.first, direction) + nestedGapIndex
}

function resizeAxisItemSizes(
  itemSizes: number[],
  minItemSizes: number[],
  gapIndex: number,
  delta: number,
): { itemSizes: number[]; appliedDelta: number } {
  const nextSizes = [...itemSizes]

  if (delta > 0) {
    const appliedDelta = shrinkAxisItems(nextSizes, minItemSizes, gapIndex, 1, delta)
    nextSizes[gapIndex - 1] += appliedDelta
    return {
      itemSizes: nextSizes,
      appliedDelta,
    }
  }

  if (delta < 0) {
    const appliedDelta = shrinkAxisItems(nextSizes, minItemSizes, gapIndex - 1, -1, Math.abs(delta))
    nextSizes[gapIndex] += appliedDelta
    return {
      itemSizes: nextSizes,
      appliedDelta: -appliedDelta,
    }
  }

  return {
    itemSizes: nextSizes,
    appliedDelta: 0,
  }
}

function shrinkAxisItems(
  itemSizes: number[],
  minItemSizes: number[],
  startIndex: number,
  step: 1 | -1,
  amount: number,
): number {
  let remaining = amount
  let applied = 0

  for (
    let index = startIndex;
    remaining > 0 && index >= 0 && index < itemSizes.length;
    index += step
  ) {
    const shrinkCapacity = Math.max(0, itemSizes[index] - minItemSizes[index])
    const shrinkAmount = Math.min(shrinkCapacity, remaining)
    itemSizes[index] -= shrinkAmount
    remaining -= shrinkAmount
    applied += shrinkAmount
  }

  return applied
}

function applyAxisItemSizes(
  layout: PanelLayoutNode,
  direction: SplitDirection,
  itemSizes: number[],
  splitterSize: number,
): PanelLayoutNode {
  const itemIndex = { current: 0 }
  return applyAxisItemSizesAtNode(layout, direction, itemSizes, splitterSize, itemIndex)
}

function applyAxisItemSizesAtNode(
  layout: PanelLayoutNode,
  direction: SplitDirection,
  itemSizes: number[],
  splitterSize: number,
  itemIndex: { current: number },
): PanelLayoutNode {
  if (layout.type !== "split" || layout.direction !== direction) {
    itemIndex.current += 1
    return layout
  }

  const firstItemCount = countAxisItems(layout.first, direction)
  const secondItemCount = countAxisItems(layout.second, direction)
  const firstAxisSize = getAxisSizeForItemRange(itemSizes, itemIndex.current, firstItemCount, splitterSize)
  const secondAxisSize = getAxisSizeForItemRange(
    itemSizes,
    itemIndex.current + firstItemCount,
    secondItemCount,
    splitterSize,
  )
  const availableSize = firstAxisSize + secondAxisSize
  const ratio = availableSize > 0 ? firstAxisSize / availableSize : layout.ratio

  return {
    ...layout,
    ratio: clampSplitRatio(ratio),
    first: applyAxisItemSizesAtNode(layout.first, direction, itemSizes, splitterSize, itemIndex),
    second: applyAxisItemSizesAtNode(layout.second, direction, itemSizes, splitterSize, itemIndex),
  }
}

function getAxisSizeForItemRange(
  itemSizes: number[],
  startIndex: number,
  itemCount: number,
  splitterSize: number,
): number {
  const itemSize = itemSizes
    .slice(startIndex, startIndex + itemCount)
    .reduce((total, size) => total + size, 0)
  return itemSize + Math.max(0, itemCount - 1) * splitterSize
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
