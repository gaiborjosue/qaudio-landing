import { fromStoreDateTime } from "./store-time"

// Instagram rules shared by the agent's tools, their schemas, and the admin
// chat's preview, so the approval card shows exactly what gets posted.
// Relative imports, because the agent imports this too.

export const INSTAGRAM_CAPTION_MAX = 2200
export const INSTAGRAM_HASHTAGS_MAX = 30
export const INSTAGRAM_MENTIONS_MAX = 20
/** Photos in a carousel; a single photo is a plain feed post. */
export const INSTAGRAM_PHOTOS_MAX = 10
/** Caption characters shown before Instagram's "more". */
export const INSTAGRAM_FOLD = 125
/** How far ahead a post may be scheduled. */
export const INSTAGRAM_SCHEDULE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const SCHEDULE_MS = INSTAGRAM_SCHEDULE_DAYS * DAY_MS
/** A scheduled time needs this much lead, so it isn't posted on the spot. */
const LEAD_MS = 2 * 60 * 1000

/** Media bucket folders a post's photos may come from. */
export const INSTAGRAM_PHOTO_SOURCES = [
  "uploads/",
  "instagram/",
  "products/",
  "news/",
] as const

export type InstagramKind = "feed" | "story"
export type InstagramFit = "cover" | "contain"

/**
 * The frame every photo of a post is fitted to: 1080 pixels wide, JPEG.
 * Feed posts take the first photo's shape, kept within Instagram's 4:5
 * (tallest) to 1.91:1 (widest); a carousel's other photos are fitted to the
 * same frame, as Instagram does. Stories are 9:16.
 */
export type InstagramFrame = {
  width: number
  height: number
  fit: InstagramFit
  /** Fills the bars around a contained photo. */
  background: "#ffffff" | "#000000"
}

const OUTPUT_WIDTH = 1080
const FEED_TALLEST = 4 / 5
const FEED_WIDEST = 1.91
const STORY_RATIO = 9 / 16

export function instagramFrame(
  kind: InstagramKind,
  fit: InstagramFit | undefined,
  first: { width: number; height: number }
): InstagramFrame {
  const ratio = first.width / first.height
  if (kind === "story") {
    // Fill the screen when the photo is about that shape; otherwise show
    // all of it on black, unless the post asks to crop.
    const close = Math.abs(ratio / STORY_RATIO - 1) <= 0.1
    return {
      width: OUTPUT_WIDTH,
      height: Math.round(OUTPUT_WIDTH / STORY_RATIO),
      fit: fit ?? (close ? "cover" : "contain"),
      background: "#000000",
    }
  }
  const framed = Math.min(FEED_WIDEST, Math.max(FEED_TALLEST, ratio))
  return {
    width: OUTPUT_WIDTH,
    height: Math.round(OUTPUT_WIDTH / framed),
    fit: fit ?? "cover",
    background: "#ffffff",
  }
}

export function hashtagCount(caption: string) {
  return caption.match(/(?:^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0
}

export function mentionCount(caption: string) {
  return caption.match(/(?:^|\s)@[A-Za-z0-9_.]+/g)?.length ?? 0
}

/** Why a store-time "YYYY-MM-DDTHH:MM" can't be scheduled, or null. */
export function instagramScheduleProblem(local: string, now = Date.now()) {
  const at = Date.parse(fromStoreDateTime(local))
  if (at < now + LEAD_MS) return "That time has passed; pick a later one."
  if (at > now + SCHEDULE_MS) {
    return `Instagram posts can be scheduled up to ${INSTAGRAM_SCHEDULE_DAYS} days ahead.`
  }
  return null
}
