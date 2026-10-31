import Image from "next/image"
import Link from "next/link"
import { FooterBar } from "@/components/footer-bar"
import { SiteNav } from "@/components/site-nav"
import styles from "./news.module.css"

export default function NewsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className={styles.page}>
      <a className="skip-link" href="#news-content">
        Skip to content
      </a>
      <SiteNav />
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Q Audio home">
          <Image
            src="/qaudio-logo.svg"
            alt="Q Audio"
            width={47}
            height={57}
            loading="eager"
          />
        </Link>
      </header>
      <main id="news-content" className={styles.main}>
        {children}
      </main>
      <FooterBar />
    </div>
  )
}
