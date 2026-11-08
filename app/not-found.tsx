import type { Metadata } from "next"
import Link from "next/link"
import { StatusPage, statusStyles as styles } from "@/components/status-page"

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: null,
  twitter: null,
}

export default function NotFound() {
  return (
    <StatusPage title="Page not found">
      <Link className={`${styles.action} ${styles.primary}`} href="/">
        Back to home
      </Link>
    </StatusPage>
  )
}
