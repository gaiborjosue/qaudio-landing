import type { Metadata } from "next"
import styles from "@/components/admin/admin.module.css"

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s — Q Audio admin" },
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: null,
  twitter: null,
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className={styles.shell}>{children}</div>
}
