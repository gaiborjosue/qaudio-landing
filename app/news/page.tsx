import type { Metadata } from "next"
import { CableHeading } from "@/components/cable-heading"
import { NewsFeed } from "@/components/news-feed"
import { getNewsCount, getNewsPage } from "@/lib/news-data"
import styles from "./news.module.css"

export const metadata: Metadata = {
  title: "News",
  description:
    "Arrivals, promotions and listening notes from Q Audio in Cambridge, Massachusetts.",
}

export default async function NewsPage() {
  const [firstPage, total] = await Promise.all([
    getNewsPage(null),
    getNewsCount(),
  ])
  return (
    <>
      <CableHeading connector="banana" className={styles.titleRow}>
        <h1 id="news-title" className={styles.heading}>
          News
        </h1>
      </CableHeading>
      <NewsFeed
        initial={firstPage ?? { items: [], nextCursor: null }}
        total={total}
        labelledBy="news-title"
      />
    </>
  )
}
