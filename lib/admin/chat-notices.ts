import { approvedProposals, releaseTool } from "./approval-choice"
import { cardHeading } from "./card-heading"
import { madeStory } from "./story-versions"
import { SAVE_TOOLS } from "./tool-names"

// What the chat's toasts say (components/admin/chat-notices.ts): while the
// owner is in another tab, a story being designed, a question or change
// card waiting, or a finished turn; beside the chat, an Instagram or Google
// post that went out. Read from the conversation like the cards, so it's
// pure and tested in scripts/chat-notices.test.mjs.

type Message = { readonly role: string; readonly parts: readonly unknown[] }
type Request = { prompt?: unknown; title?: unknown }
type Part = {
  type?: unknown
  name?: unknown
  callId?: unknown
  state?: unknown
  input?: unknown
  output?: unknown
  label?: unknown
  text?: unknown
  interaction?: unknown
}
type Open = { interactionId: string; request: Request }

const STORY_TOOLS = new Set(["design_story", "edit_story"])
const ENDED = new Set(["completed", "rejected", "failed", "cancelled"])
const text = (value: unknown) => (typeof value === "string" ? value : "")

/** The part's question, while it's open and unanswered. */
function openQuestion(part: Part): Open | null {
  const interaction = (
    part.type === "interaction" ? part : part.interaction
  ) as {
    interactionId?: unknown
    status?: unknown
    answer?: unknown
    request?: unknown
  } | null
  if (
    !interaction ||
    interaction.status !== "open" ||
    interaction.answer !== undefined ||
    typeof interaction.interactionId !== "string"
  )
    return null
  return {
    interactionId: interaction.interactionId,
    request: (interaction.request ?? {}) as Request,
  }
}

export type Waiting = {
  /** A change card, a story design waiting for Continue, or a question. */
  kind: "approval" | "story" | "question"
  id: string
  title: string
}

/** The newest question the owner hasn't answered yet, if any. */
export function waitingFor(messages: readonly Message[]): Waiting | null {
  // A card that matches what the owner already approved answers itself.
  const { approved } = approvedProposals(messages)
  let found: Waiting | null = null
  for (const message of messages) {
    for (const raw of message.parts) {
      const part = raw as Part
      const open = openQuestion(part)
      if (!open) continue
      const name = text(part.name)
      const id = open.interactionId
      if (part.type === "tool" && STORY_TOOLS.has(name)) {
        const review = (part.output as { review?: unknown } | undefined)
          ?.review
        if (review === "waiting") {
          found = { kind: "story", id, title: "Story design ready" }
          continue
        }
      }
      if (part.type === "tool" && SAVE_TOOLS.has(name)) {
        if (approved.has(text(part.callId))) continue
        found = {
          kind: "approval",
          id,
          title: text(open.request.prompt) || text(part.label),
        }
        continue
      }
      found = {
        kind: "question",
        id,
        title: text(open.request.title) || text(open.request.prompt),
      }
    }
  }
  return found
}

/** The story design being made right now, if any. */
export function designingStory(
  messages: readonly Message[]
): { id: string; editing: boolean } | null {
  for (const message of messages.toReversed()) {
    for (const raw of message.parts.toReversed()) {
      const part = raw as Part
      if (part.type !== "tool" || !STORY_TOOLS.has(text(part.name))) continue
      const output = (part.output ?? {}) as { status?: unknown }
      if (
        ENDED.has(text(part.state)) ||
        output.status === "failed" ||
        madeStory(part.output)
      )
        return null
      return { id: text(part.callId), editing: part.name === "edit_story" }
    }
  }
  return null
}

/** The changes the latest turn saved, as their cards say them. */
function savedInTurn(turn: readonly Message[], now: string) {
  return turn.flatMap((message) =>
    message.parts.flatMap((raw) => {
      const part = raw as Part
      const name = text(part.name)
      if (
        part.type !== "tool" ||
        !SAVE_TOOLS.has(name) ||
        part.state !== "completed"
      )
        return []
      return [
        cardHeading({
          name,
          input: part.input,
          output: part.output,
          label: text(part.label),
          phase: "done",
          now,
        }).title,
      ]
    })
  )
}

const MAX_SUMMARY = 140

/** Markdown as one plain line, cut to fit a toast. */
export function plainLine(markdown: string, max = MAX_SUMMARY) {
  const line = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/**
 * What the latest turn did, in a line: the changes it saved, or the start
 * of its reply.
 */
export function turnSummary(messages: readonly Message[], now: string) {
  const start = messages.findLastIndex((message) => message.role === "user")
  const turn = messages.slice(start + 1)
  const saved = savedInTurn(turn, now)
  if (saved.length > 0) {
    const more = saved.length - 2
    return (
      saved.slice(0, 2).join(". ") +
      (more > 0 ? `, and ${more} more change${more === 1 ? "" : "s"}` : "") +
      "."
    )
  }
  const reply = turn
    .filter((message) => message.role === "assistant")
    .flatMap((message) =>
      message.parts.flatMap((raw) => {
        const part = raw as Part
        return part.type === "text" ? [text(part.text)] : []
      })
    )
    .join("\n\n")
  return plainLine(reply)
}

/** Instagram and Google posts that went out, by call: what their cards say. */
export function sentPosts(messages: readonly Message[], now: string) {
  return messages.flatMap((message) =>
    message.parts.flatMap((raw) => {
      const part = raw as Part
      const name = text(part.name)
      const tool = releaseTool(name)
      if (
        part.type !== "tool" ||
        part.state !== "completed" ||
        (tool !== "save_instagram_post" && tool !== "save_google_business_post")
      )
        return []
      return [
        {
          id: text(part.callId),
          title: cardHeading({
            name,
            input: part.input,
            output: part.output,
            label: text(part.label),
            phase: "done",
            now,
          }).title,
        },
      ]
    })
  )
}
