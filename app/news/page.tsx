import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { CableHeading } from "@/components/cable-heading"
import { NewsFeed } from "@/components/news-feed"
import { getNewsCount, getNewsPage } from "@/lib/news-data"
import { pageMetadata } from "@/lib/seo"
import styles from "./news.module.css"

export const metadata: Metadata = pageMetadata({
  title: "News",
  path: "/news",
  description:
    "Arrivals, promotions and listening notes from Q Audio in Cambridge, Massachusetts.",
})

export default function NewsPage() {
  return (
    <>
      <CableHeading connector="banana" className={styles.titleRow}>
        <h1 id="news-title" className={styles.heading}>
          News
        </h1>
      </CableHeading>
      <Suspense>
        <LatestNews />
      </Suspense>
      <nav className={styles.pagination} aria-label="News archive">
        <Link href="/news/archive">Archive</Link>
      </nav>
    </>
  )
}

async function LatestNews() {
  const [firstPage, total] = await Promise.all([
    getNewsPage(null),
    getNewsCount(),
  ])
  return (
    <NewsFeed
      initial={firstPage ?? { items: [], nextCursor: null }}
      total={total}
      labelledBy="news-title"
    />
  )
}
