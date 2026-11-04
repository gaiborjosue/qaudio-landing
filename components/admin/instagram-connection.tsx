"use client"

import { useEffect, useRef, useState } from "react"
import { CircleCheck, Link2 } from "lucide-react"
import type { InstagramStatus } from "@/lib/admin/instagram-types"
import styles from "./admin.module.css"

/** The browser receives account summaries, never API keys or provider tokens. */
export function InstagramConnection() {
  const root = useRef<HTMLSpanElement>(null)
  const [status, setStatus] = useState<InstagramStatus | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const node = root.current
    if (!node) return
    const controller = new AbortController()
    let pending = false
    let lastCheck = 0
    const check = async () => {
      if (
        pending ||
        document.visibilityState === "hidden" ||
        node.getBoundingClientRect().width === 0 ||
        Date.now() - lastCheck < 30_000
      )
        return
      pending = true
      try {
        const response = await fetch("/api/instagram/status", {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("Connection check failed.")
        const next: InstagramStatus = await response.json()
        if (!controller.signal.aborted) setStatus(next)
      } catch {
        if (!controller.signal.aborted)
          setStatus((previous) => ({
            state: "unavailable",
            accounts: [],
            connectUrl: previous?.connectUrl ?? null,
            message: "Instagram connection could not be checked. Try again.",
          }))
      } finally {
        pending = false
        lastCheck = Date.now()
      }
    }
    void check()
    const resize = new ResizeObserver(() => void check())
    resize.observe(node)
    window.addEventListener("focus", check)
    document.addEventListener("visibilitychange", check)
    return () => {
      controller.abort()
      resize.disconnect()
      window.removeEventListener("focus", check)
      document.removeEventListener("visibilitychange", check)
    }
  }, [retry])

  const connected = status?.state === "connected"
  const names = status?.accounts.map((account) => `@${account.username}`) ?? []
  const label = connected
    ? `${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ""}`
    : status?.state === "reconnect"
      ? "Reconnect Instagram"
      : "Connect Instagram"
  const title = connected
    ? `Instagram connected: ${names.join(", ")}. Click to check again.`
    : status?.message
  const contents = (
    <>
      {connected ? (
        <CircleCheck
          size={15}
          className={styles.instagramCheck}
          aria-hidden="true"
        />
      ) : (
        <Link2 size={15} aria-hidden="true" />
      )}
      <span>{label}</span>
    </>
  )

  return (
    <span ref={root} className={styles.instagramConnection}>
      {!connected && status?.connectUrl ? (
        <a
          href={status.connectUrl}
          className={styles.instagramStatus}
          title={title}
          target="_blank"
          rel="noopener noreferrer"
        >
          {contents}
        </a>
      ) : (
        <button
          type="button"
          className={styles.instagramStatus}
          title={title}
          aria-label={title}
          disabled={!status}
          onClick={() => setRetry((value) => value + 1)}
        >
          {status ? (connected ? contents : "Check Instagram") : "Instagram"}
        </button>
      )}
      {status?.message && (
        <span className={styles.instagramMessage} role="status">
          {status.message}
        </span>
      )}
    </span>
  )
}
