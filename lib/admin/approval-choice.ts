import {
  dealInputSchema,
  instagramPhotoSchema,
  instagramPostInputSchema,
  newsPostInputSchema,
} from "./schemas"
import { formatStoreDateTime, STORE_DATETIME } from "./store-time"
import { previewToolName } from "./tool-names"

// The approval card's Approve step for Instagram posts, news posts, and
// deals. The owner picks how it goes out there (now, a draft, or a scheduled
// time), so the agent proposes straight away instead of asking first. A
// tool's input can't change once proposed, so a choice that differs from the
// proposal (or a carousel's rearranged photos) goes back to the agent in an
// "Approved as:" line holding just those fields, and the agent proposes the
// same thing with them. That next card counts as approved only when it is
// exactly that; anything else waits for the owner as usual. Pure, so it's
// read from the conversation (a reload keeps it) and tested in
// scripts/zernio.test.mjs.

export const APPROVED_AS = "Approved as"
/** A denial note's line with a carousel's rearranged photos. */
export const PHOTO_ORDER = "Photo order"
/** Older chats' line for a carousel approved in a new order. */
export const APPROVED_PHOTO_ORDER = "Approved photo order"
const APPROVED_LINE = new RegExp(`^${APPROVED_AS}: (.+)$`, "m")

export type Release = "now" | "draft" | "schedule"
/** The Approve step's choices, in order. */
export const RELEASES: readonly Release[] = ["now", "draft", "schedule"]

export type ReleaseTool = "save_instagram_post" | "save_news_post" | "save_deal"
type Post = Record<string, unknown>
type Photos = { photos: unknown[] }

/** The fields an "Approved as:" line may set, by tool. */
const FIELDS: Record<ReleaseTool, readonly string[]> = {
  save_instagram_post: ["when", "photos"],
  save_news_post: ["status", "published_at"],
  save_deal: ["status", "starts_at"],
}

/** The card's tool, when its Approve step asks how it goes out. */
export function releaseTool(name: string): ReleaseTool | undefined {
  const tool = previewToolName(name)
  return tool === "save_instagram_post" ||
    tool === "save_news_post" ||
    tool === "save_deal"
    ? tool
    : undefined
}

/** A proposal as its tool takes it, or null while it doesn't parse. */
function parse(tool: ReleaseTool, value: unknown): Post | null {
  const result =
    tool === "save_instagram_post"
      ? instagramPostInputSchema.safeParse(value)
      : tool === "save_news_post"
        ? newsPostInputSchema.safeParse(value)
        : dealInputSchema.safeParse(value)
  return result.success ? result.data : null
}

const isTime = (value: unknown): value is string =>
  typeof value === "string" && STORE_DATETIME.test(value)

/** JSON with sorted keys, so equal proposals compare equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

/** The choice's button: Post or Publish, Save draft, Schedule. */
export function releaseLabel(tool: ReleaseTool, release: Release) {
  if (release === "draft") return "Save draft"
  if (release === "schedule") return "Schedule"
  return tool === "save_instagram_post" ? "Post" : "Publish"
}

/** How the proposal itself goes out, so the card can lead with it. */
export function proposedRelease(
  tool: ReleaseTool,
  input: unknown,
  now: string
): Release | null {
  const post = parse(tool, input)
  if (!post) return null
  if (tool === "save_instagram_post") {
    return post.when === "now" || post.when === "draft" ? post.when : "schedule"
  }
  if (post.status !== "published") return "draft"
  const at = tool === "save_news_post" ? post.published_at : post.starts_at
  return isTime(at) && at > now ? "schedule" : "now"
}

/** The proposal's scheduled store time, where the schedule picker starts. */
export function scheduledAt(tool: ReleaseTool, input: unknown) {
  const post = parse(tool, input)
  const at =
    tool === "save_instagram_post"
      ? post?.when
      : tool === "save_news_post"
        ? post?.published_at
        : post?.starts_at
  return isTime(at) ? at : null
}

/** A deal can't start once it has ended. */
export function scheduleBefore(tool: ReleaseTool, input: unknown) {
  if (tool !== "save_deal") return null
  const ends = parse(tool, input)?.ends_at
  return isTime(ends) ? ends : null
}

/**
 * The fields a choice sets on the proposal; `at` is the scheduled store
 * time, and `now` the store time now. Publishing keeps a live post's date
 * and makes a deal waiting for its start live now.
 */
export function releaseFields(
  tool: ReleaseTool,
  input: unknown,
  release: Release,
  at: string | null,
  now: string
): Post | null {
  const post = parse(tool, input)
  if (!post || (release === "schedule" && !isTime(at))) return null
  if (tool === "save_instagram_post") {
    return { when: release === "schedule" ? at : release }
  }
  if (release === "draft") return { status: "draft" }
  if (tool === "save_news_post") {
    if (release === "schedule") return { status: "published", published_at: at }
    const live =
      post.status === "published" &&
      isTime(post.published_at) &&
      post.published_at <= now
    return {
      status: "published",
      published_at: live ? post.published_at : "now",
    }
  }
  if (release === "schedule") return { status: "published", starts_at: at }
  return {
    status: "published",
    starts_at:
      isTime(post.starts_at) && post.starts_at > now ? null : post.starts_at,
  }
}

/** The proposal with `fields` set, or null when that isn't valid (a news
 * post without a cover can't publish). */
export function withFields(tool: ReleaseTool, input: unknown, fields: Post) {
  const post = parse(tool, input)
  return post && parse(tool, { ...post, ...fields })
}

/** Whether `fields` change the proposal; if not, Approve answers it as is. */
export function changesProposal(
  tool: ReleaseTool,
  input: unknown,
  fields: Post
) {
  const post = parse(tool, input)
  const next = withFields(tool, input, fields)
  return !post || !next || canonical(post) !== canonical(next)
}

/** The owner's message approving the card with `fields` set. */
export function approvedMessage(
  tool: ReleaseTool,
  release: Release,
  fields: Post,
  at: string | null
) {
  const what =
    release === "draft"
      ? "Save it as a draft"
      : release === "schedule" && at
        ? `Schedule it for ${formatStoreDateTime(at)}`
        : tool === "save_instagram_post"
          ? "Post it now"
          : "Publish it now"
  const order =
    "photos" in fields ? ", with the photos in the order I arranged" : ""
  return `${what}${order}.\n${APPROVED_AS}: ${JSON.stringify(fields)}`
}

/** A denial's note, with a carousel's rearranged photos so they're kept. */
export function denialNote(note: string, photos: unknown[] | null) {
  const order = photos ? `${PHOTO_ORDER}: ${JSON.stringify(photos)}` : ""
  return [note.trim(), order].filter(Boolean).join("\n")
}

type Message = { readonly role: string; readonly parts: readonly unknown[] }
type Card = { tool: ReleaseTool; callId: string; post: Post }

/** Only a new order of the card's own photos. */
function samePhotos(next: unknown[], card: unknown) {
  const sorted = (list: unknown[]) => list.map(canonical).sort().join()
  return Array.isArray(card) && sorted(next) === sorted(card)
}

/** What an "Approved as:" line approves: the latest card it fits. */
function expectation(line: string, cards: readonly Card[]) {
  let fields: unknown
  try {
    fields = JSON.parse(line)
  } catch {
    return null
  }
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return null
  }
  const keys = Object.keys(fields)
  if (keys.length === 0) return null
  for (const card of [...cards].reverse()) {
    if (!keys.every((key) => FIELDS[card.tool].includes(key))) continue
    if ("photos" in fields) {
      const photos = instagramPhotoSchema
        .array()
        .safeParse((fields as Photos).photos)
      if (!photos.success || !samePhotos(photos.data, card.post.photos)) {
        continue
      }
    }
    const next = parse(card.tool, { ...card.post, ...fields })
    if (next)
      return { tool: card.tool, input: canonical(next), card: card.callId }
  }
  return null
}

/**
 * Cards the owner approved with a choice on the card before them, and the
 * cards those choices replaced, by tool call id. Only the very next change
 * card can match, and any later word from the owner cancels it.
 */
export function approvedProposals(messages: readonly Message[]) {
  const approved = new Set<string>()
  const replaced = new Set<string>()
  /** Cards since the owner last wrote: the ones a choice can be about. */
  let cards: Card[] = []
  let expected: ReturnType<typeof expectation> = null
  for (const message of messages) {
    if (message.role === "user") {
      const text = message.parts
        .map((item) => {
          const part = item as Record<string, unknown>
          return part.type === "text" && typeof part.text === "string"
            ? part.text
            : ""
        })
        .join("\n")
      const line = text.match(APPROVED_LINE)?.[1]
      expected = line ? expectation(line, cards) : null
      cards = []
      continue
    }
    for (const item of message.parts) {
      const part = item as Record<string, unknown>
      if (
        part.type !== "tool" ||
        typeof part.name !== "string" ||
        typeof part.callId !== "string" ||
        !previewToolName(part.name)
      ) {
        continue
      }
      const tool = releaseTool(part.name)
      const post = tool ? parse(tool, part.input) : null
      // A card still streaming its input doesn't parse yet; wait for it.
      if (tool && !post) continue
      if (expected) {
        if (tool === expected.tool) {
          replaced.add(expected.card)
          if (canonical(post) === expected.input) approved.add(part.callId)
        }
        expected = null
      }
      if (tool && post) cards.push({ tool, callId: part.callId, post })
    }
  }
  return { approved, replaced }
}
