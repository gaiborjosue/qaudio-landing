"use client"

import { useEffect, useRef, useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { CircleCheck, Network, TriangleAlert } from "lucide-react"
import type { InstagramStatus } from "@/lib/admin/instagram-types"
import { connectionHealth } from "@/lib/admin/connection-health"
import { InstagramConnection } from "./instagram-connection"
import styles from "./connections-menu.module.css"

/** Shared header entry point for the admin's connected services. */
export function ConnectionsMenu() {
  const [open, setOpen] = useState(false)
  const [instagram, setInstagram] = useState<InstagramStatus | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const lastCheck = useRef(0)
  const check = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    const node = trigger.current
    if (!node) return
    const controller = new AbortController()
    let pending = false
    const refresh = async () => {
      if (
        pending ||
        document.hidden ||
        node.getBoundingClientRect().width === 0 ||
        Date.now() - lastCheck.current < 30_000
      )
        return
      pending = true
      try {
        const response = await fetch("/api/instagram/status", {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("Connection check failed.")
        const status: InstagramStatus = await response.json()
        if (!controller.signal.aborted) setInstagram(status)
      } catch {
        if (!controller.signal.aborted)
          setInstagram((previous) => ({
            state: "unavailable",
            accounts: [],
            connectUrl: previous?.connectUrl ?? null,
            message: "Instagram connection could not be checked. Try again.",
          }))
      } finally {
        pending = false
        if (!controller.signal.aborted) lastCheck.current = Date.now()
      }
    }
    check.current = refresh
    void refresh()
    const observer = new ResizeObserver(() => void refresh())
    observer.observe(node)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      controller.abort()
      check.current = null
      observer.disconnect()
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [])

  const health = connectionHealth([instagram])
  const summary =
    health === "healthy"
      ? "All connected"
      : health === "warning"
        ? "Needs attention"
        : "Checking status"
  const checkAgain = () => {
    lastCheck.current = 0
    void check.current?.()
  }
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void check.current?.()
      }}
    >
      <Popover.Trigger
        ref={trigger}
        className={styles.trigger}
        aria-label={`Connections: ${summary.toLowerCase()}`}
        openOnHover
        delay={200}
        closeDelay={150}
      >
        <Network size={18} strokeWidth={1.7} aria-hidden="true" />
        {health !== "checking" && (
          <span
            className={`${styles.badge} ${health === "healthy" ? styles.check : styles.warning}`}
            aria-hidden="true"
          >
            {health === "healthy" ? (
              <CircleCheck size={12} strokeWidth={2.5} />
            ) : (
              <TriangleAlert size={12} strokeWidth={2.25} />
            )}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal keepMounted>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={10}
          collisionPadding={16}
          className={styles.positioner}
        >
          <Popover.Popup
            className={styles.popup}
            initialFocus={(interaction) => interaction === "keyboard"}
          >
            <Popover.Title className={styles.title}>Connections</Popover.Title>
            <ul className={styles.list} aria-label="Connected services">
              <InstagramConnection status={instagram} onCheck={checkAgain} />
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
