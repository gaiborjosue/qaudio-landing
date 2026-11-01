import { SiteHeader } from "@/components/site-header"
import styles from "./status-page.module.css"

export const statusStyles = styles

/**
 * Shell for the 404 and error pages: they replace the section layouts, so
 * they bring their own header and menu.
 */
export function StatusPage({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <>
      <SiteHeader contentId="status-content" />
      <main id="status-content" className={styles.main}>
        <h1>{title}</h1>
        <div className={styles.actions}>{children}</div>
      </main>
    </>
  )
}
