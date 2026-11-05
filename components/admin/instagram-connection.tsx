"use client"

import { CircleCheck } from "lucide-react"
import type { InstagramStatus } from "@/lib/admin/instagram-types"
import styles from "./connections-menu.module.css"

/** The browser receives account summaries, never API keys or provider tokens. */
export function InstagramConnection({
  status,
  onCheck,
}: {
  status: InstagramStatus | null
  onCheck: () => void
}) {
  const connected = status?.state === "connected"
  const label =
    status?.state === "reconnect"
      ? "Reconnect"
      : status?.connectUrl
        ? "Connect"
        : "Check connection"

  return (
    <li className={styles.connection}>
      {connected ? (
        status.accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            className={styles.status}
            aria-label={`Instagram connected: @${account.username}. Check connection.`}
            onClick={onCheck}
          >
            <InstagramIcon />
            <span>@{account.username}</span>
            <CircleCheck
              size={15}
              className={styles.check}
              aria-hidden="true"
            />
          </button>
        ))
      ) : status?.connectUrl ? (
        <a
          href={status.connectUrl}
          className={styles.status}
          aria-label={`${label} Instagram`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <InstagramIcon />
          <span>{label}</span>
        </a>
      ) : (
        <button
          type="button"
          className={styles.status}
          aria-label={
            status
              ? "Check Instagram connection"
              : "Checking Instagram connection"
          }
          disabled={!status}
          onClick={onCheck}
        >
          <InstagramIcon />
          <span>{status ? label : "Checking…"}</span>
        </button>
      )}
      {status?.needsAttention && status.connectUrl && (
        <a
          href={status.connectUrl}
          className={styles.status}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Manage Instagram connections"
        >
          <InstagramIcon />
          <span>Manage connection</span>
        </a>
      )}
      {status?.message && (
        <span className={styles.message} role="status">
          {status.message}
        </span>
      )}
    </li>
  )
}

/** Lucide no longer includes brand icons; match the site's Instagram glyph. */
function InstagramIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  )
}
