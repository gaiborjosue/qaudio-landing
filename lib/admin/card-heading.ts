import {
  proposedRelease,
  releaseTool,
  scheduledAt,
  type Release,
  type ReleaseTool,
} from "./approval-choice"
import { formatStoreDateTime } from "./store-time"
import { previewToolName } from "./tool-names"

// A change card's heading once the owner has answered it. While it waits,
// the card asks its tool's question ("Add the post “…”?"); after that the
// question is settled, so the heading says what is happening or happened:
// "Saving “…” as a draft", "Published “…”", "Scheduled the Instagram story
// for …". Pure, so it's tested in scripts/zernio.test.mjs.

/** Where a card stands. */
export type CardPhase =
  /** Its input is still arriving. */
  | "preparing"
  /** Waiting for the owner. */
  | "asking"
  /** Approved, being saved (or the owner's choice being proposed again). */
  | "saving"
  | "done"
  /** The owner denied it. */
  | "denied"
  /** Withdrawn: the owner wrote instead, or the turn ended. */
  | "withdrawn"
  | "failed"

/** How the card's change goes out, when the owner picked it on the card. */
export type ChosenRelease = { release: Release; at: string | null }

type Post = Record<string, unknown>

const quoted = (value: unknown) =>
  typeof value === "string" ? `“${value}”` : ""

function noun(post: Post) {
  if (post.kind === "story") return "story"
  return Array.isArray(post.photos) && post.photos.length > 1
    ? "carousel"
    : "post"
}

/** The thing a release title is about, and its name on its own. */
function subject(tool: ReleaseTool, post: Post) {
  if (tool === "save_google_business_post")
    return { object: "the Google Business post", name: "Google Business post" }
  if (tool === "save_news_post") {
    return {
      object: quoted(post.title),
      name: `News post ${quoted(post.title)}`,
    }
  }
  if (tool === "save_deal") {
    return {
      object: `the deal ${quoted(post.title)}`,
      name: `QDeal ${quoted(post.title)}`,
    }
  }
  return {
    object: `the Instagram ${noun(post)}`,
    name: `Instagram ${noun(post)}`,
  }
}

/** "Saved “…” as a draft", "Publishing the deal “…”", and so on. */
function releaseSentence(
  tool: ReleaseTool,
  post: Post,
  { release, at }: ChosenRelease,
  done: boolean
) {
  const { object } = subject(tool, post)
  const when = at ? ` for ${formatStoreDateTime(at)}` : ""
  if (release === "draft") {
    return `${done ? "Saved" : "Saving"} ${object} as a draft`
  }
  if (release === "schedule") {
    return `${done ? "Scheduled" : "Scheduling"} ${object}${when}`
  }
  if (tool === "save_google_business_post")
    return `${done ? "Posted" : "Posting"} to Google Business`
  if (tool === "save_instagram_post") {
    return `${done ? "Posted" : "Posting"} the ${noun(post)} to Instagram`
  }
  return `${done ? "Published" : "Publishing"} ${object}`
}

/**
 * How a saved change went out, from what the tool returned where that's
 * surer than the input: a news post or deal is live, or not yet.
 */
function savedRelease(
  tool: ReleaseTool,
  post: Post,
  output: unknown,
  now: string
): ChosenRelease | null {
  const result = (output ?? {}) as { status?: unknown; live?: unknown }
  if (
    tool === "save_google_business_post" &&
    post.when === "now" &&
    result.status !== "published"
  )
    return null
  if (tool === "save_instagram_post" || tool === "save_google_business_post") {
    const release = proposedRelease(tool, post, now)
    return release && { release, at: scheduledAt(tool, post) }
  }
  if (post.status !== "published" || result.status === "draft") {
    return { release: "draft", at: null }
  }
  if (result.live === true) return { release: "now", at: null }
  const at = scheduledAt(tool, post)
  // Published but not live, and not starting later: a deal that has ended.
  return at && at > now ? { release: "schedule", at } : null
}

/** What a finished change's status pill says. */
function doneStatus(name: string) {
  const kind = previewToolName(name) ?? ""
  if (kind.startsWith("delete_")) return "Deleted"
  if (kind === "end_sale") return "Ended"
  if (kind === "retry_instagram_post") return "Sent"
  return "Saved"
}

/**
 * The card's title and status pill. `label` is the tool's own label for
 * the call (eve's: its start label, or its complete label once saved), and
 * `prompt` its approval question.
 */
export function cardHeading({
  name,
  input,
  output,
  label,
  prompt,
  phase,
  chosen,
  note,
  now,
}: {
  name: string
  input: unknown
  output?: unknown
  label: string
  prompt?: string
  phase: CardPhase
  /** The choice the owner made on it, while it's proposed again. */
  chosen?: ChosenRelease
  /** The owner's note with a denial. */
  note?: boolean
  /** Store time now, "YYYY-MM-DDTHH:MM". */
  now: string
}): { title: string; status: string } {
  const tool = releaseTool(name)
  const post =
    tool && input && typeof input === "object" ? (input as Post) : null
  switch (phase) {
    case "preparing":
      return { title: label, status: "Preparing" }
    case "asking":
      return { title: prompt ?? label, status: "Waiting for approval" }
    case "saving": {
      const release =
        chosen ??
        (tool && post
          ? (() => {
              const release = proposedRelease(tool, post, now)
              return release && { release, at: scheduledAt(tool, post) }
            })()
          : null)
      return {
        title:
          tool && post && release
            ? releaseSentence(tool, post, release, false)
            : label,
        status: "Saving",
      }
    }
    case "done": {
      const release = tool && post && savedRelease(tool, post, output, now)
      return {
        title:
          tool && post && release
            ? releaseSentence(tool, post, release, true)
            : label,
        status: doneStatus(name),
      }
    }
    case "denied":
    case "withdrawn":
    case "failed":
      return {
        title: tool && post ? subject(tool, post).name : label,
        status:
          phase === "failed"
            ? "Failed"
            : phase === "denied" && note
              ? "Changes requested"
              : "Not saved",
      }
  }
}

/** Whether a saved change's page is there to visit: not while it's a
 * draft or scheduled. */
export function visitableUrl(output: unknown) {
  const result = (output ?? {}) as { url?: unknown; live?: unknown }
  if (typeof result.url !== "string") return null
  return result.live === false ? null : result.url
}
