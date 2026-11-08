import { SiteHeader } from "@/components/site-header"
import { FooterBar } from "@/components/footer-bar"
import styles from "./information.module.css"

export default function InformationLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={styles.page}>
      <SiteHeader contentId="information-content" />
      <main id="information-content" className={styles.main}>
        {children}
      </main>
      <FooterBar />
    </div>
  )
}
