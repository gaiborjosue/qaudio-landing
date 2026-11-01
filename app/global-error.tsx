"use client"

import { useEffect } from "react"
import { StatusPage, statusStyles as styles } from "@/components/status-page"
import "./globals.css"

// Errors in the root layout itself. This replaces the layout, so it renders
// its own <html> and <body> (without the loader or web fonts).
export default function GlobalError({
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
    <html lang="en">
      <body>
        <title>Something went wrong — Q Audio</title>
        <StatusPage title="Something went wrong">
          <button
            type="button"
            className={`${styles.action} ${styles.primary}`}
            onClick={() => retry()}
          >
            Try again
          </button>
        </StatusPage>
      </body>
    </html>
  )
}
