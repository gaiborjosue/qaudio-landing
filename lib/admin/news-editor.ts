import type { NewsInline } from "../news"
import type { NewsBlockInput, NewsPostInput } from "./schemas"
import type { NewsRecord } from "./news-save"
import { slugify } from "./product-editor"

// The News tab's post form: what the owner types, before it's a
// NewsPostInput. The article body is written as Markdown (bold, links,
// headings, lists, quotes, and photos), the way product descriptions are,
// and turned back into NewsBlock JSON on save.

export type NewsCoverValue = NonNullable<NewsPostInput["cover"]>
export type PhotoSize = { width: number; height: number }

export type NewsValues = {
  /** Set once the post exists; Save then edits it. */
  id?: string
  title: string
  slug: string
  body: string
  /** Sizes of the photos the body may show, by media path. */
  photos: Record<string, PhotoSize>
  cover: NewsCoverValue | null
  status: "draft" | "published"
  /** Store time "YYYY-MM-DDTHH:MM", or "" (publish now, or undated draft). */
  publishedAt: string
  expiresAt: string
}

export { slugify }

const SAFE_HREF = /^(https?:|mailto:|tel:|\/(?!\/))/i
const IMAGE_LINE =
  /^!\[((?:\\.|[^\]\\])*)\]\(([^\s)]+)(?:\s+"((?:\\.|[^"\\])*)")?\)$/

const escapeText = (text: string, link = false) =>
  text.replace(link ? /[\\*[\]]/g : /[\\*[]/g, "\\$&")

// Markers that would start another block at the beginning of a line.
const escapeLineStarts = (text: string) =>
  text.replace(/(^|\n)(?=#|>|[-*+] |!\[)/g, "$1\\")

const unescape = (text: string) => text.replace(/\\(.)/g, "$1")

function inlineToMarkdown(content: NewsInline[]) {
  return escapeLineStarts(
    content
      .map((part) => {
        if (typeof part === "string") return escapeText(part)
        const text = part.href
          ? `[${escapeText(part.text, true)}](${part.href})`
          : escapeText(part.text)
        return part.strong ? `**${text}**` : text
      })
      .join("")
  )
}

/** Index of the next unescaped `marker` at or after `from`, or -1. */
function find(text: string, marker: string, from: number) {
  for (let at = from; at < text.length; at++) {
    if (text[at] === "\\") at++
    else if (text.startsWith(marker, at)) return at
  }
  return -1
}

/** Bold runs and links in one line of Markdown, as NewsInline parts. */
export function parseInline(text: string): NewsInline[] {
  const parts: NewsInline[] = []
  const push = (value: string, strong: boolean, href?: string) => {
    if (!value) return
    const last = parts[parts.length - 1]
    if (!strong && !href) {
      if (typeof last === "string") parts[parts.length - 1] = last + value
      else parts.push(value)
      return
    }
    if (
      typeof last === "object" &&
      !last.href &&
      !href &&
      !!last.strong === strong
    ) {
      last.text += value
      return
    }
    parts.push({
      text: value,
      ...(strong ? { strong } : {}),
      ...(href ? { href } : {}),
    })
  }

  const run = (source: string, strong: boolean) => {
    let plain = ""
    const flush = () => {
      push(unescape(plain), strong)
      plain = ""
    }
    for (let at = 0; at < source.length; at++) {
      const char = source[at]
      if (char === "\\" && at + 1 < source.length) {
        plain += source.slice(at, at + 2)
        at++
        continue
      }
      if (!strong && source.startsWith("**", at)) {
        const close = find(source, "**", at + 2)
        if (close > at + 2) {
          flush()
          run(source.slice(at + 2, close), true)
          at = close + 1
          continue
        }
      }
      if (char === "[") {
        const close = find(source, "](", at + 1)
        const end = close === -1 ? -1 : source.indexOf(")", close + 2)
        const href = end === -1 ? "" : source.slice(close + 2, end)
        if (close > at + 1 && SAFE_HREF.test(href) && !/\s/.test(href)) {
          flush()
          push(unescape(source.slice(at + 1, close)), strong, href)
          at = end
          continue
        }
      }
      plain += char
    }
    flush()
  }

  run(text, false)
  return parts
}

/** The stored body blocks as the Markdown the form shows. */
export function blocksToMarkdown(blocks: NewsBlockInput[]) {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "paragraph":
          return inlineToMarkdown(block.content)
        case "heading":
          return `## ${block.text.replace(/\n/g, " ")}`
        case "quote":
          return block.text
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n")
        case "list":
          return block.items
            .map((item) => `- ${inlineToMarkdown(item).replace(/\n/g, "\n  ")}`)
            .join("\n")
        case "image": {
          const alt = block.image.alt.replace(/[\\\]]/g, "\\$&")
          const caption = block.caption
            ? ` "${block.caption.replace(/[\\"]/g, "\\$&")}"`
            : ""
          return `![${alt}](${block.image.src}${caption})`
        }
      }
    })
    .join("\n\n")
}

export type BodyProblem = "photo-size" | "photo-alt"

/**
 * The Markdown body as NewsBlock JSON. Photos need a known size (photos
 * added in the form, or already in the post) and alt text.
 */
export function markdownToBlocks(
  markdown: string,
  photos: Record<string, PhotoSize>
): { blocks: NewsBlockInput[]; problem?: BodyProblem } {
  const blocks: NewsBlockInput[] = []
  let problem: BodyProblem | undefined
  const chunks = markdown
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((chunk) => chunk.replace(/^\n+|\s+$/g, ""))
    .filter((chunk) => chunk.trim())

  for (const chunk of chunks) {
    const lines = chunk.split("\n")
    const image = lines.length === 1 && IMAGE_LINE.exec(chunk.trim())
    if (image) {
      const [, alt, src, caption] = image
      const size = photos[src]
      if (!size) problem ??= "photo-size"
      else if (!unescape(alt).trim()) problem ??= "photo-alt"
      if (size) {
        blocks.push({
          type: "image",
          image: { src, ...size, alt: unescape(alt).trim() },
          ...(caption && { caption: unescape(caption) }),
        })
      }
      continue
    }
    const heading = lines.length === 1 && /^#{1,6}\s+(.+)$/.exec(chunk)
    if (heading) {
      blocks.push({ type: "heading", text: heading[1].trim() })
      continue
    }
    if (lines.every((line) => line.startsWith(">"))) {
      blocks.push({
        type: "quote",
        text: lines.map((line) => line.replace(/^>\s?/, "")).join("\n"),
      })
      continue
    }
    if (/^[-*+] /.test(lines[0])) {
      const items: string[] = []
      for (const line of lines) {
        if (/^[-*+] /.test(line)) items.push(line.slice(2))
        else items[items.length - 1] += `\n${line.replace(/^\s+/, "")}`
      }
      blocks.push({
        type: "list",
        items: items.map(parseInline).filter((item) => item.length > 0),
      })
      continue
    }
    const content = parseInline(chunk)
    if (content.length > 0) blocks.push({ type: "paragraph", content })
  }
  return {
    blocks: blocks.filter(
      (block) => block.type !== "list" || block.items.length > 0
    ),
    problem,
  }
}

/** Photo sizes a post's cover and body already have. */
function photoSizes(record: NewsRecord) {
  const photos: Record<string, PhotoSize> = {}
  for (const block of record.body) {
    if (block.type === "image") {
      const { src, width, height } = block.image
      photos[src] = { width, height }
    }
  }
  if (record.cover) {
    const { path, width, height } = record.cover
    photos[path] = { width, height }
  }
  return photos
}

/** A blank form for a new post. */
export function blankNewsValues(): NewsValues {
  return {
    title: "",
    slug: "",
    body: "",
    photos: {},
    cover: null,
    status: "draft",
    publishedAt: "",
    expiresAt: "",
  }
}

export function valuesFromNews(record: NewsRecord): NewsValues {
  return {
    id: record.id,
    title: record.title,
    slug: record.slug,
    body: blocksToMarkdown(record.body),
    photos: photoSizes(record),
    cover: record.cover,
    status: record.status,
    publishedAt: record.published_at ?? "",
    expiresAt: record.expires_at ?? "",
  }
}

/**
 * The post Save sends, before validation (newsPostInputSchema checks it on
 * both sides). A body left as it was keeps its stored blocks exactly, so
 * saving other fields never reformats an article. Publishing without a date
 * publishes now.
 */
export function inputFromNews(values: NewsValues, original?: NewsRecord) {
  const untouched = original && values.body === blocksToMarkdown(original.body)
  const parsed = untouched
    ? { blocks: original.body }
    : markdownToBlocks(values.body, values.photos)
  const input = {
    ...(values.id && { id: values.id }),
    slug: values.slug.trim(),
    title: values.title.trim(),
    body: parsed.blocks,
    cover: values.cover && { ...values.cover, alt: values.cover.alt.trim() },
    status: values.status,
    ...(values.expiresAt !== undefined && {
      expires_at: values.expiresAt || null,
    }),
    published_at:
      values.publishedAt ||
      (values.status === "published" ? ("now" as const) : null),
  }
  return { input, problem: "problem" in parsed ? parsed.problem : undefined }
}
