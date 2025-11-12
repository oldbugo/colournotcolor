"use client"

export type Align = "auto" | "top" | "bottom"
type ElementLike<T extends HTMLElement = HTMLElement> = T | null | (() => T | null)

export type VisibilityMargins = {
  card: number
  group: number
  nudge: number
}

export type IllusionOptions = {
  skip?: boolean
  jumpThresholdPx?: number
  amplitudePx?: {
    min: number
    max: number
  }
  durationMs?: {
    min: number
    max: number
  }
}

export type GroupSnapOptions = {
  root?: ElementLike<HTMLElement>
  target: ElementLike<HTMLElement>
  scrollParent?: ElementLike<HTMLElement>
  align?: Align
  force?: boolean
  margins?: Partial<VisibilityMargins>
  skipSnapIllusion?: boolean
  offsetPx?: number
  illusion?: IllusionOptions
}

export type CardSnapOptions = {
  root?: ElementLike<HTMLElement>
  card: ElementLike<HTMLElement>
  scrollParent?: ElementLike<HTMLElement>
  allowCenter?: boolean
  skipSnapIllusion?: boolean
  margins?: Partial<VisibilityMargins>
  nudgeBandPx?: number
}

export type SnapRequest =
  | { kind: "group"; options: GroupSnapOptions }
  | { kind: "card"; options: CardSnapOptions }

export type CancelHandle = {
  cancel(): void
}

type SnapAction = {
  moved: boolean
  settleMs: number
  cancel?: () => void
}

type PerformResult =
  | { usedAttempt: boolean; status: "done" }
  | { usedAttempt: boolean; status: "wait"; delay: number }
  | { usedAttempt: boolean; status: "retry"; delay?: number }

const DEFAULT_MARGINS: VisibilityMargins = {
  card: 48,
  group: 16,
  nudge: 28,
}

const DEFAULT_OFFSET_PX = 56
const DEFAULT_GROUP_SCROLL_DURATION = 320
const DEFAULT_CARD_SCROLL_DURATION = 260
const DEFAULT_JUMP_THRESHOLD = 420
const DEFAULT_MAX_ATTEMPTS = 8
const MIN_SETTLE_MS = 120

const DEFAULT_ILLUSION_AMPLITUDE = { min: 4, max: 18 }
const DEFAULT_ILLUSION_DURATION = { min: 160, max: 220 }

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined"

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const resolveElement = <T extends HTMLElement>(value: ElementLike<T>): T | null => {
  if (typeof value === "function") {
    try {
      return value()
    } catch {
      return null
    }
  }
  return value ?? null
}

const mergeMargins = (overrides?: Partial<VisibilityMargins>): VisibilityMargins => ({
  card: overrides?.card ?? DEFAULT_MARGINS.card,
  group: overrides?.group ?? DEFAULT_MARGINS.group,
  nudge: overrides?.nudge ?? DEFAULT_MARGINS.nudge,
})

const prefersReducedMotion = () =>
  isBrowser() &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

const scrollParentCache = new WeakMap<HTMLElement, HTMLElement | null>()

export function findScrollParent(root: HTMLElement | null): HTMLElement | null {
  if (!isBrowser()) {
    return null
  }

  if (!root) {
    return (document.scrollingElement as HTMLElement | null) ?? document.documentElement ?? null
  }

  const cached = scrollParentCache.get(root)
  if (cached && cached.isConnected) {
    return cached
  }

  let current: HTMLElement | null = root.parentElement
  while (current) {
    const style = window.getComputedStyle(current)
    const overflowY = style.overflowY || style.overflow
    if (overflowY === "auto" || overflowY === "scroll") {
      scrollParentCache.set(root, current)
      return current
    }
    current = current.parentElement
  }

  const fallback = (document.scrollingElement as HTMLElement | null) ?? document.documentElement ?? null
  scrollParentCache.set(root, fallback)
  return fallback
}

export function measureRect(node: Element | null): DOMRect | null {
  if (!node) return null
  try {
    return node.getBoundingClientRect()
  } catch {
    return null
  }
}

type TweenHandle = {
  cancel(): void
}

const activeTweens = new WeakMap<HTMLElement, TweenHandle>()

const startTween = (
  element: HTMLElement,
  target: number,
  duration: number,
  onComplete?: () => void,
): SnapAction => {
  if (!isBrowser() || duration <= 0 || prefersReducedMotion()) {
    element.scrollTop = target
    onComplete?.()
    return { moved: true, settleMs: 0 }
  }

  const start = element.scrollTop
  const delta = target - start
  if (Math.abs(delta) < 0.5) {
    element.scrollTop = target
    onComplete?.()
    return { moved: false, settleMs: 0 }
  }

  const previous = activeTweens.get(element)
  previous?.cancel()

  let rafId: number | null = null
  const startTime = performance.now()

  const cancel = () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId)
      rafId = null
    }
    if (activeTweens.get(element)?.cancel === cancel) {
      activeTweens.delete(element)
    }
  }

  const step = (now: number) => {
    const progress = Math.min((now - startTime) / Math.max(duration, 1), 1)
    const eased = easeInOutCubic(progress)
    element.scrollTop = start + delta * eased
    if (progress < 1) {
      rafId = window.requestAnimationFrame(step)
    } else {
      rafId = null
      if (activeTweens.get(element)?.cancel === cancel) {
        activeTweens.delete(element)
      }
      onComplete?.()
    }
  }

  rafId = window.requestAnimationFrame(step)
  const handle: TweenHandle = { cancel }
  activeTweens.set(element, handle)
  return { moved: true, settleMs: duration, cancel }
}

type IllusionHandle = {
  cancel(): void
  duration: number
}

const activeIllusions = new WeakMap<HTMLElement, IllusionHandle>()

const stopIllusion = (root: HTMLElement | null) => {
  if (!root) return
  const handle = activeIllusions.get(root)
  if (handle) {
    handle.cancel()
    activeIllusions.delete(root)
  }
}

const runSnapIllusion = (
  root: HTMLElement | null,
  delta: number,
  options?: IllusionOptions,
): IllusionHandle | null => {
  if (!isBrowser() || !root || !Number.isFinite(delta) || Math.abs(delta) < 2) {
    return null
  }
  if (prefersReducedMotion() || options?.skip) {
    return null
  }

  stopIllusion(root)

  const amplitudeRange = options?.amplitudePx ?? DEFAULT_ILLUSION_AMPLITUDE
  const durationRange = options?.durationMs ?? DEFAULT_ILLUSION_DURATION

  const magnitude = Math.sqrt(Math.min(Math.abs(delta), DEFAULT_JUMP_THRESHOLD * 2))
  const direction = delta > 0 ? 1 : -1
  const amplitude = clamp(magnitude * 1.25, amplitudeRange.min, amplitudeRange.max) * direction
  const duration = clamp(Math.round(150 + magnitude * 2.5), durationRange.min, durationRange.max)

  root.style.transition = "none"
  root.style.transform = "none"
  void root.offsetHeight
  root.style.transition = `transform ${duration}ms cubic-bezier(0.33, 1, 0.68, 1)`
  root.style.transform = `translateY(${amplitude}px)`

  const rafId = window.requestAnimationFrame(() => {
    root.style.transform = "translateY(0px)"
  })

  const timeoutId = window.setTimeout(() => {
    root.style.transition = ""
    root.style.transform = ""
    activeIllusions.delete(root)
  }, duration + 50)

  const cancel = () => {
    window.cancelAnimationFrame(rafId)
    window.clearTimeout(timeoutId)
    root.style.transition = ""
    root.style.transform = ""
    activeIllusions.delete(root)
  }

  const handle = { cancel, duration }
  activeIllusions.set(root, handle)
  return handle
}

type ScrollCommand = {
  target: number
  duration: number
  jump: boolean
}

const planScrollCommand = (
  element: HTMLElement,
  target: number,
  duration: number,
  illusionOpts?: IllusionOptions,
): ScrollCommand => {
  const delta = target - element.scrollTop
  const absDelta = Math.abs(delta)
  const jumpThreshold = illusionOpts?.jumpThresholdPx ?? DEFAULT_JUMP_THRESHOLD

  if (prefersReducedMotion() || absDelta <= jumpThreshold) {
    return { target, duration, jump: false }
  }

  return { target, duration: clamp(duration * 0.6, 120, duration), jump: true }
}

const applyScrollCommand = (
  element: HTMLElement,
  command: ScrollCommand,
  root: HTMLElement | null,
  illusionOpts?: IllusionOptions,
): SnapAction => {
  const delta = command.target - element.scrollTop
  if (Math.abs(delta) < 0.5) {
    return { moved: false, settleMs: 0 }
  }

  if (!command.jump) {
    return startTween(element, command.target, command.duration)
  }

  element.scrollTop = command.target
  const illusion = runSnapIllusion(root, delta, illusionOpts)
  return {
    moved: true,
    settleMs: illusion?.duration ?? MIN_SETTLE_MS,
    cancel: illusion?.cancel,
  }
}

const getScrollParent = (
  scrollParent: ElementLike<HTMLElement> | undefined,
  fallbackRoot: ElementLike<HTMLElement> | undefined,
) => {
  const resolved = resolveElement(scrollParent ?? null)
  if (resolved) {
    return resolved
  }
  return findScrollParent(resolveElement(fallbackRoot ?? null))
}

export function ensureGroupVisibility(options: GroupSnapOptions): SnapAction | null {
  if (!isBrowser()) {
    return { moved: false, settleMs: 0 }
  }

  const target = resolveElement(options.target)
  const scrollParent = getScrollParent(options.scrollParent, options.root ?? options.target)
  if (!target || !scrollParent) {
    return null
  }

  const margins = mergeMargins({ group: options.margins?.group })
  const parentRect = measureRect(scrollParent)
  const sectionRect = measureRect(target)
  if (!parentRect || !sectionRect) {
    return null
  }

  const visibleTop = parentRect.top + margins.group
  const visibleBottom = parentRect.bottom - margins.group
  const fullyVisible = sectionRect.top >= visibleTop && sectionRect.bottom <= visibleBottom

  if (fullyVisible && !options.force) {
    return { moved: false, settleMs: 0 }
  }

  const needsUp = sectionRect.top < visibleTop
  const needsDown = sectionRect.bottom > visibleBottom
  const alignPreference = options.align ?? "auto"
  const offset = options.offsetPx ?? DEFAULT_OFFSET_PX
  const availableHeight = Math.max(parentRect.height - margins.group * 2, 0)
  const isOversized = availableHeight > 0 && sectionRect.height >= availableHeight

  let desiredTop: number
  if (alignPreference === "top") {
    desiredTop = parentRect.top + offset
  } else if (isOversized) {
    desiredTop = visibleTop
  } else if (alignPreference === "bottom") {
    desiredTop = visibleBottom - sectionRect.height
  } else if (needsDown && !needsUp) {
    desiredTop = visibleBottom - sectionRect.height
  } else {
    desiredTop = parentRect.top + offset
  }

  const clampMin = visibleTop
  const clampMax = Math.max(visibleTop, visibleBottom - sectionRect.height)
  desiredTop = clamp(desiredTop, clampMin, clampMax)
  const delta = sectionRect.top - desiredTop
  if (Math.abs(delta) < 0.5 && !options.force) {
    return { moved: false, settleMs: 0 }
  }

  const maxScrollTop = Math.max(scrollParent.scrollHeight - scrollParent.clientHeight, 0)
  const targetScrollTop = clamp(scrollParent.scrollTop + delta, 0, maxScrollTop)

  const command = planScrollCommand(
    scrollParent,
    targetScrollTop,
    DEFAULT_GROUP_SCROLL_DURATION,
    options.skipSnapIllusion ? { ...options.illusion, skip: true } : options.illusion,
  )

  return applyScrollCommand(scrollParent, command, resolveElement(options.root ?? options.target), options.illusion)
}

export function ensureCardVisibility(options: CardSnapOptions): SnapAction | null {
  if (!isBrowser()) {
    return { moved: false, settleMs: 0 }
  }

  const card = resolveElement(options.card)
  const scrollParent = getScrollParent(options.scrollParent, options.root ?? options.card)
  if (!card || !scrollParent) {
    return null
  }

  const margins = mergeMargins(options.margins)
  const parentRect = measureRect(scrollParent)
  const cardRect = measureRect(card)
  if (!parentRect || !cardRect) {
    return null
  }

  const visibleTop = parentRect.top + margins.card
  const visibleBottom = parentRect.bottom - margins.card
  const viewportHeight = Math.max(visibleBottom - visibleTop, 1)
  const cardHeight = cardRect.height
  const nudge = options.nudgeBandPx ?? margins.nudge

  const minTop = Math.min(visibleTop, visibleBottom - cardHeight)
  const maxTop = Math.max(visibleTop, visibleBottom - cardHeight)
  const safeTop = Math.min(visibleTop + nudge, maxTop)
  const safeBottomTop = Math.max(visibleBottom - nudge - cardHeight, minTop)
  const allowCenter = options.allowCenter ?? true

  let desiredTop: number | null = null

  if (cardHeight > viewportHeight && allowCenter) {
    desiredTop = parentRect.top + parentRect.height / 2 - cardHeight / 2
  } else {
    const outsideTop = cardRect.top < visibleTop
    const outsideBottom = cardRect.bottom > visibleBottom
    const nearTop = cardRect.top < safeTop
    const nearBottom = cardRect.bottom > visibleBottom - nudge

    if (outsideTop) {
      desiredTop = visibleTop
    } else if (outsideBottom) {
      desiredTop = visibleBottom - cardHeight
    } else if (nearTop) {
      desiredTop = safeTop
    } else if (nearBottom) {
      desiredTop = safeBottomTop
    }
  }

  if (desiredTop === null) {
    return { moved: false, settleMs: 0 }
  }

  const maxScrollTop = Math.max(scrollParent.scrollHeight - scrollParent.clientHeight, 0)
  const clampedTargetTop = clamp(desiredTop, minTop, maxTop)
  const delta = cardRect.top - clampedTargetTop

  if (Math.abs(delta) < 0.5) {
    return { moved: false, settleMs: 0 }
  }

  const targetScrollTop = clamp(scrollParent.scrollTop + delta, 0, maxScrollTop)

  const command = planScrollCommand(
    scrollParent,
    targetScrollTop,
    DEFAULT_CARD_SCROLL_DURATION,
    options.skipSnapIllusion ? { skip: true } : undefined,
  )

  return applyScrollCommand(scrollParent, command, resolveElement(options.root ?? options.card))
}

type ScheduleOptions = {
  maxAttempts?: number
}

type SchedulerState = {
  attempts: number
  verifyingGroup: boolean
  verifyingCard: boolean
}

export function scheduleSnap(request: SnapRequest, options?: ScheduleOptions): CancelHandle {
  if (!isBrowser()) {
    return { cancel: () => undefined }
  }

  const maxAttempts = Math.max(1, options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)

  const state: SchedulerState = {
    attempts: 0,
    verifyingGroup: false,
    verifyingCard: false,
  }

  let cancelled = false
  let rafId: number | null = null
  let timeoutId: number | null = null
  let activeMovementCancel: (() => void) | undefined
  let cleanupInterrupts: (() => void) | null = null

  const cleanup = () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId)
      rafId = null
    }
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
      timeoutId = null
    }
    activeMovementCancel?.()
    activeMovementCancel = undefined
    cleanupInterrupts?.()
    cleanupInterrupts = null
  }

  const cancel = () => {
    if (cancelled) return
    cancelled = true
    cleanup()
  }

  const attachInterrupts = (element: HTMLElement | null) => {
    if (!element || cleanupInterrupts || !isBrowser()) {
      return
    }
    const handleInterrupt = () => cancel()
    element.addEventListener("wheel", handleInterrupt, { passive: true })
    element.addEventListener("touchstart", handleInterrupt, { passive: true })
    element.addEventListener("touchmove", handleInterrupt, { passive: true })
    cleanupInterrupts = () => {
      element.removeEventListener("wheel", handleInterrupt)
      element.removeEventListener("touchstart", handleInterrupt)
      element.removeEventListener("touchmove", handleInterrupt)
      cleanupInterrupts = null
    }
  }

  const scheduleNext = (delay = 0) => {
    if (cancelled) {
      return
    }
    const runRaf = () => {
      rafId = window.requestAnimationFrame(step)
    }
    if (delay > 0) {
      timeoutId = window.setTimeout(() => {
        timeoutId = null
        runRaf()
      }, delay)
    } else {
      runRaf()
    }
  }

  const runGroupPhase = (groupOptions: GroupSnapOptions): PerformResult => {
    const target = resolveElement(groupOptions.target)
    const scrollParent = getScrollParent(groupOptions.scrollParent, groupOptions.root ?? groupOptions.target)
    if (!target || !scrollParent) {
      return { usedAttempt: false, status: "retry", delay: 32 }
    }
    attachInterrupts(scrollParent)
    const action = ensureGroupVisibility(groupOptions)
    if (state.verifyingGroup && action && action.moved) {
      return {
        usedAttempt: true,
        status: "wait",
        delay: Math.max(action.settleMs, MIN_SETTLE_MS),
      }
    }
    if (action && !action.moved && state.verifyingGroup) {
      state.verifyingGroup = false
    }
    if (!action?.moved && state.verifyingGroup) {
      state.verifyingGroup = false
    }
    if (action?.moved) {
      state.verifyingGroup = true
      activeMovementCancel?.()
      activeMovementCancel = action.cancel
      return {
        usedAttempt: true,
        status: "wait",
        delay: Math.max(action.settleMs, MIN_SETTLE_MS),
      }
    }
    return { usedAttempt: true, status: "done" }
  }

  const runCardPhase = (options: CardSnapOptions): PerformResult => {
    const card = resolveElement(options.card)
    const scrollParent = getScrollParent(options.scrollParent, options.root ?? options.card)
    if (!card || !scrollParent) {
      return { usedAttempt: false, status: "retry", delay: 32 }
    }
    attachInterrupts(scrollParent)

    const action = ensureCardVisibility({
      ...options,
      skipSnapIllusion: options.skipSnapIllusion || state.verifyingCard,
    })
    if (!action) {
      return { usedAttempt: false, status: "retry", delay: 32 }
    }
    if (action.moved) {
      state.verifyingCard = true
      activeMovementCancel?.()
      activeMovementCancel = action.cancel
      return {
        usedAttempt: true,
        status: "wait",
        delay: Math.max(action.settleMs, MIN_SETTLE_MS),
      }
    }
    if (state.verifyingCard) {
      state.verifyingCard = false
      return { usedAttempt: true, status: "done" }
    }
    return { usedAttempt: true, status: "done" }
  }

  const perform = (): PerformResult =>
    request.kind === "group" ? runGroupPhase(request.options) : runCardPhase(request.options)

  const step = () => {
    if (cancelled) {
      return
    }
    rafId = null
    const result = perform()
    if (result.usedAttempt) {
      state.attempts += 1
      if (state.attempts >= maxAttempts && result.status !== "wait") {
        cleanup()
        return
      }
    }
    if (result.status === "done") {
      cleanup()
      return
    }
    if (result.status === "wait") {
      scheduleNext(result.delay)
      return
    }
    scheduleNext(result.delay ?? 32)
  }

  scheduleNext()
  return { cancel }
}
