import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { NewsBody } from "@/components/news-body"
import { formatNewsDate } from "@/lib/news"
import { getNewsPost, getNewsSlugs } from "@/lib/news-data"
import styles from "../news.module.css"

type Props = { params: Promise<{ slug: string }> }

// Published posts are prerendered; newer ones render on first visit. Pages
// regenerate at most every 5 minutes, matching the news data cache.
export const revalidate = 300

export async function generateStaticParams() {
  const slugs = await getNewsSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getNewsPost((await params).slug)
  if (!post) return {}
  return {
    title: `${post.title} — Q Audio`,
    description: post.excerpt,
  }
}

export default async function NewsArticlePage({ params }: Props) {
  const post = await getNewsPost((await params).slug)
  if (!post) notFound()

  return (
    <article aria-labelledby="article-title">
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
