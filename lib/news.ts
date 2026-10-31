// Client-safe news types and helpers. Posts live in Supabase and are read by
// lib/news-data.ts, which only server code imports.

export type NewsImage = {
  src: string
  width: number
  height: number
  alt: string
}

/** Plain text, bold text, or a link. A "\n" inside text becomes a line break. */
export type NewsInline =
  string | { text: string; strong?: boolean; href?: string }

/**
 * Article body blocks, stored as JSON in news_posts.body. In the database an
 * image's `src` is its path in the media bucket; reads resolve it to a URL.
 */
export type NewsBlock =
  | { type: "paragraph"; content: NewsInline[] }
  | { type: "heading"; text: string }
  | { type: "list"; items: NewsInline[][] }
  | { type: "quote"; text: string }
  | { type: "image"; image: NewsImage; caption?: string }

export type NewsCover = NewsImage & {
  /** Letterbox instead of cropping, for posters and wide product shots. */
  fit?: "contain"
}

export type NewsPost = {
  /** Matches the live qaudio.com permalink, /news/<slug>. */
  slug: string
  title: string
  /** Publication date in store time, "YYYY-MM-DD". */
  date: string
  excerpt: string
  cover: NewsCover
  body: NewsBlock[]
}

/** What the feed needs for a card; article bodies stay on article pages. */
export type NewsSummary = Pick<
  NewsPost,
  "slug" | "title" | "date" | "excerpt" | "cover"
>

export type NewsPage = {
  items: NewsSummary[]
  /** Opaque position after the last card, or null at the end of the feed. */
  nextCursor: string | null
}

export const NEWS_PAGE_SIZE = 3

/** Most cards one feed request may return, e.g. when restoring a long feed. */
export const NEWS_MAX_PAGE_SIZE = 24

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** "Oct 15, 2026" or "October 15, 2026"; formatted by hand so server and client agree. */
export function formatNewsDate(date: string, style: "short" | "long") {
  const [year, month, day] = date.split("-").map(Number)
  const name = MONTHS[month - 1]
  return `${style === "short" ? name.slice(0, 3) : name} ${day}, ${year}`
}

function inlineText(content: NewsInline[]) {
  return content
    .map((part) => (typeof part === "string" ? part : part.text))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
}

// Joins preview text into sentences, so a bold lead or a line without
// closing punctuation doesn't run into the next one.
function sentence(text: string) {
  return /[.!?:]$/.test(text) ? text : `${text}.`
}

/**
 * Plain-text card preview from the opening paragraphs and list items: the
 * value saved in news_posts.excerpt (the imported posts used it too).
 */
export function newsExcerpt(body: NewsBlock[], maxLength = 200) {
  const parts: string[] = []
  for (const block of body) {
    if (block.type === "paragraph") parts.push(inlineText(block.content))
    if (block.type === "quote") parts.push(block.text)
    if (block.type === "list") {
      for (const item of block.items) {
        const [lead, ...rest] = item
        const bold = typeof lead !== "string" && lead.strong && rest.length
        parts.push(
          bold ? `${sentence(lead.text)} ${inlineText(rest)}` : inlineText(item)
        )
      }
    }
    if (parts.join(" ").length > maxLength) break
  }
  const text = parts.filter(Boolean).map(sentence).join(" ")
  if (text.length <= maxLength) return text
  const cut = text.slice(0, maxLength)
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,.;:–—-]+$/, "")}…`
}
