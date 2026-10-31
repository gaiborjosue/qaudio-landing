"use client"

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react"
import { flushSync } from "react-dom"
import { NEWS_MAX_PAGE_SIZE, type NewsPage, type NewsSummary } from "@/lib/news"
import { readScrollPosition, rememberScrollPosition } from "@/lib/scroll-memory"
import { NewsCard } from "./news-card"
import styles from "./news-feed.module.css"

type Feed = {
  items: NewsSummary[]
  nextCursor: string | null
  /** Cards from this index on arrived after the first render and animate in. */
  appendedFrom: number
}

type LoadedPage = { cursor: string; result: NewsPage }

// Cards loaded so far outlive client-side navigation, so returning from an
// article renders the feed at the length (and height) the visitor left it.
let feedCache: Omit<Feed, "appendedFrom"> | null = null

// How many cards this tab has loaded, so a reload or a full-page return can
// fetch enough for its saved scroll position.
const LOADED_KEY = "qaudio:news-loaded"

function readLoadedCount() {
  try {
    return Number(window.sessionStorage.getItem(LOADED_KEY)) || 0
  } catch {
    return 0
  }
}

async function fetchPage(cursor: string, limit?: number): Promise<LoadedPage> {
  const params = new URLSearchParams({ cursor })
  if (limit) params.set("limit", String(limit))
  const response = await fetch(`/api/news?${params}`)
  if (!response.ok) throw new Error(`News feed: ${response.status}`)
  return { cursor, result: await response.json() }
}

// Appends a page only if it continues the feed, so overlapping requests
// can't duplicate cards or step back.
function appendPage(feed: Feed, page: LoadedPage, animate: boolean): Feed {
  if (page.cursor !== feed.nextCursor) return feed
  return {
    items: [...feed.items, ...page.result.items],
    nextCursor: page.result.nextCursor,
    appendedFrom: animate
      ? feed.items.length
      : feed.items.length + page.result.items.length,
  }
}

// The cache only applies while it starts with the same newest post as the
// server's first page; otherwise the feed has changed and starts fresh.
function startingFeed(initial: NewsPage): Omit<Feed, "appendedFrom"> {
  const cached = feedCache
  const continues =
    cached !== null &&
    cached.items.length >= initial.items.length &&
    initial.items.every(
      (item, index) => cached.items[index]?.slug === item.slug
    )
  return continues ? cached : initial
}

function newsYear(date: string) {
  return date.slice(0, 4)
}

// A hairline label that starts each year's cards. It is hidden from assistive
// tech because every card's <time> already carries the full date.
function YearDivider({ year, stagger }: { year: string; stagger?: number }) {
  return (
    <div
      className={styles.year}
      aria-hidden="true"
      data-appended={stagger === undefined ? undefined : ""}
      style={
        stagger === undefined
          ? undefined
          : ({ "--stagger": stagger } as CSSProperties)
      }
    >
      {year}
    </div>
  )
}

type NewsFeedProps = {
  initial: NewsPage
  total: number
  labelledBy: string
}

/**
 * One-column news feed, newest first. The server renders the first page;
 * later pages load from /api/news as the end of the feed nears.
 */
export function NewsFeed({ initial, total, labelledBy }: NewsFeedProps) {
  const [feed, setFeed] = useState<Feed>(() => {
    const start = startingFeed(initial)
    return { ...start, appendedFrom: start.items.length }
  })
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const startRef = useRef(feed)
  const feedRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadPage = useCallback(async (cursor: string) => {
    setStatus("loading")
    try {
      const loaded = await fetchPage(cursor)
      setFeed((current) => appendPage(current, loaded, true))
      setStatus("idle")
    } catch {
      setStatus("error")
    }
  }, [])

  useEffect(() => {
    feedCache = { items: feed.items, nextCursor: feed.nextCursor }
    try {
      const loaded = Math.max(readLoadedCount(), feed.items.length)
      window.sessionStorage.setItem(LOADED_KEY, String(loaded))
    } catch {
      // Storage can be unavailable; restoring fewer cards is harmless.
    }
  }, [feed])

  // Back, forward and reload return to the saved position: load the cards it
  // needs in one request first, then scroll. Saving starts only after that,
  // as on the home page.
  useEffect(() => {
    let active = true
    let stopRemembering: (() => void) | undefined
    const saved = readScrollPosition()

    async function restore() {
      const { items, nextCursor } = startRef.current
      const missing = Math.min(
        readLoadedCount() - items.length,
        NEWS_MAX_PAGE_SIZE
      )
      if (saved !== null && nextCursor !== null && missing > 0) {
        const page = await fetchPage(nextCursor, missing).catch(() => null)
        if (!active) return
        if (page) {
          flushSync(() =>
            setFeed((current) => appendPage(current, page, false))
          )
        }
      }
      if (!active) return
      if (saved !== null) window.scrollTo({ top: saved, behavior: "instant" })
      stopRemembering = rememberScrollPosition()
    }

    void restore()
    return () => {
      active = false
      stopRemembering?.()
    }
  }, [])

  // Loads the next page once the end of the feed is within reach.
  useEffect(() => {
    const sentinel = sentinelRef.current
    const cursor = feed.nextCursor
    if (!sentinel || cursor === null || status !== "idle") return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadPage(cursor)
      },
      { rootMargin: "0px 0px 900px 0px" }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [feed.nextCursor, status, loadPage])

  // Touch screens can't hover, so the card crossing the middle of the screen
  // becomes the active one and shows its photo in color.
  useEffect(() => {
    const root = feedRef.current
    if (!root || !window.matchMedia("(hover: none)").matches) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.toggleAttribute("data-active", entry.isIntersecting)
        }
      },
      { rootMargin: "-45% 0px -45% 0px" }
    )
    root.querySelectorAll("article").forEach((card) => observer.observe(card))
    return () => observer.disconnect()
  }, [feed.items.length])

  // Feed pattern keys: Page Down/Up move focus between cards.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "PageDown" && event.key !== "PageUp") return
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const links = Array.from(
      event.currentTarget.querySelectorAll<HTMLAnchorElement>("article h2 a")
    )
    const index = links.findIndex((link) => link === document.activeElement)
    const target = links[index + (event.key === "PageDown" ? 1 : -1)]
    if (index === -1 || !target) return
    event.preventDefault()
    target.focus({ preventScroll: true })
    target.closest("article")?.scrollIntoView({ block: "center" })
  }

  const { nextCursor } = feed
  return (
    <>
      <div
        ref={feedRef}
        className={styles.feed}
        role="feed"
        aria-busy={status === "loading"}
        aria-labelledby={labelledBy}
        onKeyDown={onKeyDown}
      >
        {feed.items.map((post, index) => {
          const year = newsYear(post.date)
          const stagger =
            index >= feed.appendedFrom ? index - feed.appendedFrom : undefined
          return (
            <Fragment key={post.slug}>
              {index === 0 || newsYear(feed.items[index - 1].date) !== year ? (
                <YearDivider year={year} stagger={stagger} />
              ) : null}
              <NewsCard
                post={post}
                position={index + 1}
                total={Math.max(total, feed.items.length)}
                priority={index < 2}
                stagger={stagger}
              />
            </Fragment>
          )
        })}
      </div>
      {status === "loading" ? (
        <div className={styles.skeleton} aria-hidden="true">
          <div className={styles.skeletonMedia} />
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
        </div>
      ) : null}
      {status === "error" && nextCursor !== null ? (
        <button
          type="button"
          className={styles.more}
          onClick={() => void loadPage(nextCursor)}
        >
          Load more
        </button>
      ) : null}
      {nextCursor !== null ? (
        <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
      ) : null}
    </>
  )
}
