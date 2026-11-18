import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import {
  NEWS_PAGE_SIZE,
  NEWS_ARCHIVE_PAGE_SIZE,
  type NewsBlock,
  type NewsCover,
  type NewsImage,
  type NewsInline,
  type NewsPage,
  type NewsPost,
  type NewsSummary,
} from "@/lib/news"
import { STORE_TIME_ZONE } from "@/lib/store-hours"
import { mediaUrl, publicSupabase } from "@/lib/supabase/public"

// These reads include scheduled and expiring posts. Bound the hard cache
// lifetime so an expired post clears from the feed, archive, and article.
export const NEWS_CACHE_TAG = "news"

function cacheNews() {
  cacheLife({ stale: 0, revalidate: 30, expire: 60 })
  cacheTag(NEWS_CACHE_TAG)
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type CardRow = {
  id: string
  slug: string
  title: string
  excerpt: string
  cover_path: string | null
  cover_width: number | null
  cover_height: number | null
  cover_alt: string
  cover_fit: string
  published_at: string | null
}

const storeDateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: STORE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** "YYYY-MM-DD" of a timestamp in store time. */
function storeDate(timestamp: string) {
  const parts = Object.fromEntries(
    storeDateFormat
      .formatToParts(new Date(timestamp))
      .map(({ type, value }) => [type, value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

// The cursor is the last card's (published_at, id), kept opaque for clients.
function encodeCursor(row: CardRow) {
  return Buffer.from(`${row.published_at}_${row.id}`).toString("base64url")
}

function decodeCursor(cursor: string) {
  const [publishedAt, id, ...rest] = Buffer.from(cursor, "base64url")
    .toString()
    .split("_")
  if (rest.length || !TIMESTAMP.test(publishedAt) || !UUID.test(id ?? "")) {
    return null
  }
  return { publishedAt, id }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Media paths are relative to the bucket: no leading slash or "..".
function isMediaPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[\w.-]+(\/[\w.-]+)*$/.test(value) &&
    !value.split("/").includes("..")
  )
}

function isSafeHref(href: string) {
  return /^(https?:|mailto:|tel:|\/(?!\/))/i.test(href)
}

function toImage(value: unknown): NewsImage | null {
  if (!isRecord(value) || !isMediaPath(value.src)) return null
  const { width, height, alt } = value
  if (typeof width !== "number" || typeof height !== "number") return null
  return {
    src: mediaUrl(value.src),
    width,
    height,
    alt: typeof alt === "string" ? alt : "",
  }
}

function toInline(value: unknown): NewsInline | null {
  if (typeof value === "string") return value
  if (!isRecord(value) || typeof value.text !== "string") return null
  const inline: Exclude<NewsInline, string> = { text: value.text }
  if (value.strong === true) inline.strong = true
  if (typeof value.href === "string" && isSafeHref(value.href)) {
    inline.href = value.href
  }
  return inline
}

function toInlines(value: unknown) {
  if (!Array.isArray(value)) return null
  const parts = value.map(toInline)
  return parts.every((part) => part !== null) ? parts : null
}

// Bodies are JSON written by the app; anything malformed is skipped rather
// than breaking the page, and links are limited to safe schemes.
function toBlock(value: unknown): NewsBlock | null {
  if (!isRecord(value)) return null
  switch (value.type) {
    case "paragraph": {
      const content = toInlines(value.content)
      return content ? { type: "paragraph", content } : null
    }
    case "heading":
    case "quote":
      return typeof value.text === "string"
        ? { type: value.type, text: value.text }
        : null
    case "list": {
      if (!Array.isArray(value.items)) return null
      const items = value.items.map(toInlines)
      return items.every((item) => item !== null)
        ? { type: "list", items }
        : null
    }
    case "image": {
      const image = toImage(value.image)
      if (!image) return null
      return typeof value.caption === "string"
        ? { type: "image", image, caption: value.caption }
        : { type: "image", image }
    }
    default:
      return null
  }
}

function toCover(row: CardRow): NewsCover | null {
  const { cover_path: path, cover_width: width, cover_height: height } = row
  if (!isMediaPath(path) || !width || !height) return null
  return {
    src: mediaUrl(path),
    width,
    height,
    alt: row.cover_alt,
    ...(row.cover_fit === "contain" && { fit: "contain" as const }),
  }
}

function toSummary(row: CardRow): NewsSummary | null {
  const cover = toCover(row)
  if (!cover || !row.published_at) return null
  return {
    slug: row.slug,
    title: row.title,
    date: storeDate(row.published_at),
    excerpt: row.excerpt,
    cover,
  }
}

async function fetchFeedRows(
  afterPublishedAt: string | null,
  afterId: string | null,
  maxRows: number
) {
  "use cache"
  cacheNews()
  const { data, error } = await publicSupabase().rpc("news_feed", {
    after_published_at: afterPublishedAt ?? undefined,
    after_id: afterId ?? undefined,
    max_rows: maxRows,
  })
  if (error) throw new Error(`News feed: ${error.message}`)
  return data
}

/**
 * Feed cards after `cursor` (null for the newest), newest first. Returns null
 * for a malformed cursor.
 */
export async function getNewsPage(
  cursor: string | null,
  limit = NEWS_PAGE_SIZE
): Promise<NewsPage | null> {
  const after = cursor === null ? null : decodeCursor(cursor)
  if (cursor !== null && !after) return null
  const rows = await fetchFeedRows(
    after?.publishedAt ?? null,
    after?.id ?? null,
    limit + 1
  )
  const pageRows = rows.slice(0, limit)
  const last = pageRows[pageRows.length - 1]
  return {
    items: pageRows.map(toSummary).filter((item) => item !== null),
    nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
  }
}

/** Number of published posts, for the feed's aria-setsize. */
export async function getNewsCount() {
  "use cache"
  cacheNews()
  const { count, error } = await publicSupabase()
    .from("news_posts")
    .select("id", { count: "exact", head: true })
  if (error) throw new Error(`News count: ${error.message}`)
  return count ?? 0
}

/** Slugs of published posts, for prerendering article pages. */
export async function getNewsSlugs() {
  "use cache"
  cacheLife("content")
  cacheTag(NEWS_CACHE_TAG)
  const { data, error } = await publicSupabase()
    .from("news_posts")
    .select("slug")
  if (error) throw new Error(`News slugs: ${error.message}`)
  return data.map(({ slug }) => slug)
}

async function fetchPostRow(slug: string) {
  "use cache"
  cacheNews()
  const { data, error } = await publicSupabase()
    .from("news_posts")
    .select(
      "id, slug, title, excerpt, body, cover_path, cover_width, cover_height, cover_alt, cover_fit, published_at, updated_at"
    )
    .eq("slug", slug)
    .maybeSingle()
  if (error) throw new Error(`News post ${slug}: ${error.message}`)
  return data
}

/** A published post by slug, or null. */
export async function getNewsPost(slug: string): Promise<NewsPost | null> {
  if (!SLUG.test(slug)) return null
  const row = await fetchPostRow(slug)
  const summary = row && toSummary(row)
  if (!row || !summary) return null
  const body = Array.isArray(row.body)
    ? row.body.map(toBlock).filter((block) => block !== null)
    : []
  return {
    ...summary,
    body,
    publishedAt: row.published_at!,
    modifiedAt: row.updated_at,
  }
}

/** A server-rendered archive page; the existing feed still scrolls progressively. */
export async function getNewsArchivePage(page: number): Promise<NewsPage> {
  "use cache"
  cacheNews()
  const offset = (page - 1) * NEWS_ARCHIVE_PAGE_SIZE
  const { data, error } = await publicSupabase()
    .from("news_posts")
    .select(
      "id, slug, title, excerpt, cover_path, cover_width, cover_height, cover_alt, cover_fit, published_at"
    )
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + NEWS_ARCHIVE_PAGE_SIZE)
  if (error) throw new Error(`News archive: ${error.message}`)
  const rows = data.slice(0, NEWS_ARCHIVE_PAGE_SIZE)
  const last = rows.at(-1)
  return {
    items: rows.map(toSummary).filter((item) => item !== null),
    nextCursor:
      data.length > NEWS_ARCHIVE_PAGE_SIZE && last ? encodeCursor(last) : null,
  }
}

export async function getNewsSitemapEntries() {
  "use cache"
  cacheNews()
  const { data, error } = await publicSupabase()
    .from("news_posts")
    .select("slug, updated_at, cover_path, cover_width, cover_height")
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("slug")
  if (error) throw new Error(`News sitemap: ${error.message}`)
  return data
    .filter(
      (post) =>
        isMediaPath(post.cover_path) && post.cover_width && post.cover_height
    )
    .map((post) => ({
      slug: post.slug,
      modifiedAt: post.updated_at,
      images: [mediaUrl(post.cover_path!)],
    }))
}
