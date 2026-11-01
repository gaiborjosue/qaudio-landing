"use client"

import { useEffect } from "react"
import Link from "next/link"
import { StatusPage, statusStyles as styles } from "@/components/status-page"

// Uncaught errors in any page below the root layout. In production, server
// errors arrive with only a digest that matches the server logs.
export default function ErrorPage({
  error,
  retry,
}: {
  error: unknown
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <StatusPage title="Something went wrong">
      <button
        type="button"
        className={`${styles.action} ${styles.primary}`}
        onClick={() => retry()}
      >
        Try again
      </button>
      <Link className={styles.action} href="/">
        Back to home
      </Link>
    </StatusPage>
  )
}
