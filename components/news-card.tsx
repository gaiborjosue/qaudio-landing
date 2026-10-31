import type { CSSProperties } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { formatNewsDate, type NewsSummary } from "@/lib/news"
import styles from "./news-feed.module.css"

// Cult UI's CutoutCard corner: a concave fillet that blends a notch into the
// photo's edge. Unrotated, it fills the bottom-right of its box.
const CORNER_PATH = "M0 200C155.996 199.961 200.029 156.308 200 0V200H0Z"

function CutoutCorner({ className }: { className: string }) {
  return (
    <svg
      className={`${styles.corner} ${className}`}
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
    >
      <path d={CORNER_PATH} fill="currentColor" />
    </svg>
  )
}

export const NEWS_CARD_SIZES = "(max-width: 760px) calc(100vw - 44px), 680px"

type NewsCardProps = {
  post: NewsSummary
  /** 1-based position and total count, for the feed's article semantics. */
  position: number
  total: number
  /** The first cards hold the likely LCP image, depending on the screen. */
  priority?: boolean
  /** Order within a freshly loaded page, for the entrance stagger. */
  stagger?: number
}

/**
 * A news card inspired by Cult UI's CutoutCard: the photo is notched at the
 * bottom left for the date and at the top right for the arrow, whose well
 * turns into a spinning record on hover. The title link stretches over the
 * whole card.
 */
export function NewsCard({
  post,
  position,
  total,
  priority = false,
  stagger,
}: NewsCardProps) {
  const titleId = `news-${post.slug}`
  return (
    <article
      className={styles.card}
      aria-labelledby={titleId}
      aria-posinset={position}
      aria-setsize={total}
      data-appended={stagger === undefined ? undefined : ""}
      style={
        stagger === undefined
          ? undefined
          : ({ "--stagger": stagger } as CSSProperties)
      }
    >
      <div className={styles.media} data-fit={post.cover.fit}>
        <Image
          src={post.cover.src}
          alt=""
          fill
          sizes={NEWS_CARD_SIZES}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
        />
        <span className={styles.date}>
          <time dateTime={post.date}>{formatNewsDate(post.date, "short")}</time>
          <CutoutCorner className={styles.dateCornerEnd} />
          <CutoutCorner className={styles.dateCornerTop} />
        </span>
        <span className={styles.pin} aria-hidden="true">
          <span className={styles.icon}>
            <span className={styles.vinyl} />
            <ArrowUpRight size={18} strokeWidth={1.5} />
          </span>
          <CutoutCorner className={styles.pinCornerStart} />
          <CutoutCorner className={styles.pinCornerBottom} />
        </span>
      </div>
      <div className={styles.body}>
        <h2 id={titleId} className={styles.title}>
          <Link href={`/news/${post.slug}`}>{post.title}</Link>
        </h2>
        <p className={styles.excerpt}>{post.excerpt}</p>
      </div>
    </article>
  )
}
