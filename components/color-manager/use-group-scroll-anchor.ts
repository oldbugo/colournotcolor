"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type GroupScrollAnchorState = {
  groupName: string
  viewportTop: number
}

type UseGroupScrollAnchorOptions = {
  /**
   * When false, queueGroupScrollAnchor becomes a no-op unless the call passes
   * `force: true`. Used by ColorManager to wire the anchor behind the
   * "collapse groups during group drag" preference.
   */
  enabled: boolean
  /** Resolve the scroll parent currently in play. */
  getScrollParent: () => HTMLElement | null
  /** Resolve a group's section element by its name. */
  findGroupSectionElement: (groupName: string | null) => HTMLElement | null
  /**
   * After this many ms the anchor is auto-released. Defaults to 260ms,
   * matching the original ColorManager constant.
   */
  lockMs?: number
}

type UseGroupScrollAnchorResult = {
  /**
   * Capture the group's current viewport position and start anchoring it.
   * The anchor is auto-released after `lockMs`. Set `force: true` to anchor
   * even when `enabled` is false.
   */
  queueGroupScrollAnchor: (groupName: string | null, force?: boolean) => void
  /**
   * Release the current anchor immediately, or after `delay` ms.
   */
  releaseGroupScrollAnchor: (delay?: number) => void
}

/**
 * Preserve a target group's vertical viewport position across layout shifts
 * (group collapse/expand, content reflow). While an anchor is set, a
 * requestAnimationFrame loop measures the group's current rect.top each frame
 * and corrects the scroll parent's scrollTop by the delta.
 */
export function useGroupScrollAnchor({
  enabled,
  getScrollParent,
  findGroupSectionElement,
  lockMs = 260,
}: UseGroupScrollAnchorOptions): UseGroupScrollAnchorResult {
  const anchorRef = useRef<GroupScrollAnchorState | null>(null)
  const releaseTimeoutRef = useRef<number | null>(null)
  const [version, setVersion] = useState(0)

  // Read the latest options through refs so the callbacks stay stable while
  // still seeing up-to-date values for `enabled` and the resolvers.
  const enabledRef = useRef(enabled)
  const getScrollParentRef = useRef(getScrollParent)
  const findGroupSectionElementRef = useRef(findGroupSectionElement)
  useEffect(() => {
    enabledRef.current = enabled
    getScrollParentRef.current = getScrollParent
    findGroupSectionElementRef.current = findGroupSectionElement
  }, [enabled, getScrollParent, findGroupSectionElement])

  const releaseGroupScrollAnchor = useCallback((delay = 0) => {
    // Nothing to release. Avoid scheduling a timer that might clear a future anchor.
    if (anchorRef.current === null && releaseTimeoutRef.current === null) {
      return
    }

    if (typeof window !== "undefined" && releaseTimeoutRef.current !== null) {
      window.clearTimeout(releaseTimeoutRef.current)
      releaseTimeoutRef.current = null
    }

    const clearAnchor = () => {
      anchorRef.current = null
      setVersion((v) => v + 1)
    }

    if (delay <= 0 || typeof window === "undefined") {
      clearAnchor()
      return
    }

    releaseTimeoutRef.current = window.setTimeout(() => {
      clearAnchor()
      releaseTimeoutRef.current = null
    }, delay)
  }, [])

  const queueGroupScrollAnchor = useCallback(
    (groupName: string | null, force = false) => {
      if (!groupName) {
        return
      }
      if (!enabledRef.current && !force) {
        return
      }

      const section = findGroupSectionElementRef.current(groupName)
      if (!section) {
        return
      }

      const rect = section.getBoundingClientRect()
      anchorRef.current = {
        groupName,
        viewportTop: rect.top,
      }

      setVersion((v) => v + 1)
      releaseGroupScrollAnchor(lockMs)
    },
    [lockMs, releaseGroupScrollAnchor],
  )

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    if (!anchorRef.current) {
      return
    }

    let rafId = 0
    const tick = () => {
      const anchor = anchorRef.current
      if (!anchor) {
        return
      }

      const section = findGroupSectionElementRef.current(anchor.groupName)
      const scrollParent = getScrollParentRef.current()
      if (section && scrollParent) {
        const currentTop = section.getBoundingClientRect().top
        const delta = currentTop - anchor.viewportTop
        if (Math.abs(delta) > 0.5) {
          scrollParent.scrollTop += delta
        }
      }

      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [version])

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && releaseTimeoutRef.current !== null) {
        window.clearTimeout(releaseTimeoutRef.current)
      }
      anchorRef.current = null
    }
  }, [])

  return { queueGroupScrollAnchor, releaseGroupScrollAnchor }
}
