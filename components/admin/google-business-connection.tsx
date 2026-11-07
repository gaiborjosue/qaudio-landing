"use client"

import { CircleCheck } from "lucide-react"
import type { GoogleBusinessStatus } from "@/lib/admin/google-business-types"
import styles from "./connections-menu.module.css"

/** Monochrome Google Business storefront glyph. */
function GoogleBusinessIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10v10h16V10M3 10l2-7h14l2 7M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 3v7m6-7v7" />
      <path d="M16.5 14.5a3 3 0 1 0 .5 3H14" />
    </svg>
  )
}

export function GoogleBusinessConnection({
  status,
  onCheck,
}: {
  status: GoogleBusinessStatus | null
  onCheck: () => void
}) {
  const connected = status?.state === "connected"
  const label =
    status?.state === "reconnect"
      ? "Reconnect Google Business"
      : "Connect Google Business"
  return (
    <li className={styles.connection}>
      {connected ? (
        status.accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            className={styles.status}
            aria-label={`Google Business connected: ${account.name}. Check connection.`}
            onClick={onCheck}
          >
            <GoogleBusinessIcon />
            <span>{account.name}</span>
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
          target="_blank"
          rel="noopener noreferrer"
        >
          <GoogleBusinessIcon />
          <span>{label}</span>
        </a>
      ) : (
        <button
          type="button"
          className={styles.status}
          disabled={!status}
          onClick={onCheck}
        >
          <GoogleBusinessIcon />
          <span>
            {status ? "Check Google Business" : "Checking Google Business…"}
          </span>
        </button>
      )}
      {status?.needsAttention && status.connectUrl && (
        <a
          href={status.connectUrl}
          className={styles.status}
          target="_blank"
          rel="noopener noreferrer"
        >
          <GoogleBusinessIcon />
          <span>Manage Google Business</span>
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
