import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { CableHeading } from "@/components/cable-heading"
import { StructuredData } from "@/components/structured-data"
import { getNewsArchivePage, getNewsCount } from "@/lib/news-data"
import { formatNewsDate, newsArchiveHref, newsArchivePage } from "@/lib/news"
import { breadcrumbs, pageMetadata } from "@/lib/seo"
import styles from "../news.module.css"

type Props = { searchParams: Promise<{ page?: string | string[] }> }

async function archivePage(searchParams: Props["searchParams"]) {
  const [{ page: value }, total] = await Promise.all([
    searchParams,
    getNewsCount(),
  ])
  const page = newsArchivePage(value, total)
  if (page === null) notFound()
  return { page, total }
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { page } = await archivePage(searchParams)
  return pageMetadata({
    title: page === 1 ? "News archive" : `News archive — Page ${page}`,
    description:
      "Arrivals, promotions and listening notes from Q Audio in Cambridge, Massachusetts.",
    path: newsArchiveHref(page),
  })
}

export default function ArchivePage({ searchParams }: Props) {
  return (
    <Suspense>
      <Archive searchParams={searchParams} />
    </Suspense>
  )
}

async function Archive({ searchParams }: Props) {
  const { page } = await archivePage(searchParams)
  const posts = await getNewsArchivePage(page)
  if (page > 1 && posts.items.length === 0) notFound()
  return (
    <>
      <StructuredData
        value={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "News", path: "/news" },
          { name: "Archive", path: newsArchiveHref(page) },
        ])}
      />
      <CableHeading connector="banana" className={styles.titleRow}>
        <h1 className={styles.heading}>News archive</h1>
      </CableHeading>
      <ol className={styles.archive}>
        {posts.items.map((post) => (
          <li key={post.slug}>
            <time dateTime={post.date}>
              {formatNewsDate(post.date, "short")}
            </time>
            <Link href={`/news/${post.slug}`}>{post.title}</Link>
          </li>
        ))}
      </ol>
      <nav className={styles.pagination} aria-label="Archive pages">
        {page > 1 ? (
          <Link href={newsArchiveHref(page - 1)}>Newer</Link>
        ) : (
          <Link href="/news">Latest news</Link>
        )}
        {posts.nextCursor ? (
          <Link href={newsArchiveHref(page + 1)}>Older</Link>
        ) : null}
      </nav>
    </>
  )
}
