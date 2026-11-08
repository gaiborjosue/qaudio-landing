import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { NewsBody } from "@/components/news-body"
import { formatNewsDate } from "@/lib/news"
import { getNewsPost, getNewsSlugs } from "@/lib/news-data"
import { StructuredData } from "@/components/structured-data"
import { articleStructuredData, breadcrumbs, pageMetadata } from "@/lib/seo"
import styles from "../news.module.css"

type Props = { params: Promise<{ slug: string }> }

// Published posts are prerendered; newer ones render on first visit. Their
// data refreshes with the news cache ("content" profile, 5 minutes).
export async function generateStaticParams() {
  const slugs = await getNewsSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getNewsPost((await params).slug)
  if (!post) notFound()
  const metadata = pageMetadata({
    title: post.title,
    description: post.excerpt,
    path: `/news/${post.slug}`,
    image: post.cover,
  })
  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.modifiedAt,
    },
  }
}

export default function NewsArticlePage({ params }: Props) {
  return (
    <Suspense>
      <NewsArticle params={params} />
    </Suspense>
  )
}

// The post comes from the URL, so it streams in from the cache inside
// Suspense while the shared App Shell prefetches.
async function NewsArticle({ params }: Props) {
  const post = await getNewsPost((await params).slug)
  if (!post) notFound()

  return (
    <article aria-labelledby="article-title">
      <StructuredData value={articleStructuredData(post)} />
      <StructuredData
        value={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "News", path: "/news" },
          { name: post.title, path: `/news/${post.slug}` },
        ])}
      />
      <Link className={styles.back} href="/news">
        <span aria-hidden="true">←</span>All news
      </Link>
      <p className={styles.kicker}>
        <time dateTime={post.date}>{formatNewsDate(post.date, "long")}</time>
      </p>
      <h1 id="article-title" className={styles.title}>
        {post.title}
      </h1>
      <figure className={styles.cover}>
        <Image
          src={post.cover.src}
          alt={post.cover.alt}
          width={post.cover.width}
          height={post.cover.height}
          sizes="(max-width: 760px) calc(100vw - 44px), 680px"
          loading="eager"
          fetchPriority="high"
        />
      </figure>
      <NewsBody blocks={post.body} />
    </article>
  )
}
