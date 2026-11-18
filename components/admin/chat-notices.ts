"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import type { EveMessage } from "eve/react"
import {
  designingStory,
  sentPosts,
  turnSummary,
  waitingFor,
  type Waiting,
} from "@/lib/admin/chat-notices"
import { toStoreDateTime } from "@/lib/admin/store-time"
import { dismissToast, toast } from "./admin-toast"

const WAITING: Record<Waiting["kind"], { title: string; button: string }> = {
  approval: { title: "Tune needs your OK", button: "Review" },
  story: { title: "Story design ready", button: "View" },
  question: { title: "Tune has a question", button: "Answer" },
}

/**
 * The chat's toasts. While the owner is in another tab: the story being
 * designed, then whatever waits for them (a change card, the design's
 * Continue, a question) or that the turn finished, each with a button
 * back to the chat. Beside the chat: an Instagram or Google post that went
 * out. A reopened chat's history toasts nothing; only what happens after.
 */
export function useChatNotices({
  active,
  busy,
  resuming,
  messages,
  error,
  onOpen,
}: {
  active: boolean
  busy: boolean
  resuming: boolean
  messages: readonly EveMessage[]
  error?: Error
  /** Shows the chat. */
  onOpen: () => void
}) {
  const open = useRef(onOpen)
  useLayoutEffect(() => {
    open.current = onOpen
  })
  /** The toast shown while away, and what it was about. */
  const away = useRef<{ token: number; key: string } | null>(null)
  /** What's already been said (or was there before), by key. */
  const said = useRef<Set<string> | null>(null)
  const wasBusy = useRef(busy)

  // Back in the chat, what the toast pointed at is on screen.
  useEffect(() => {
    if (!active || !away.current) return
    dismissToast(away.current.token)
    away.current = null
  }, [active])

  useEffect(() => {
    const finished = wasBusy.current && !busy
    wasBusy.current = busy
    if (resuming) return
    const now = toStoreDateTime(new Date())
    const posts = sentPosts(messages, now)
    const waiting = busy ? null : waitingFor(messages)
    // The first settled read is the history: note it, say nothing.
    if (!said.current) {
      said.current = new Set([
        ...posts.map((post) => `post:${post.id}`),
        ...(waiting ? [`wait:${waiting.id}`] : []),
      ])
      return
    }
    const seen = said.current
    const once = (key: string) => !seen.has(key) && !!seen.add(key)
    const view = { title: "View", onClick: () => open.current() }

    for (const post of posts) {
      if (once(`post:${post.id}`) && active)
        toast("success", { title: post.title, place: "chat" })
    }
    // A question that came while the owner was here needs no reminder.
    if (active) {
      if (waiting) seen.add(`wait:${waiting.id}`)
      return
    }

    const show = (key: string, fire: () => number) => {
      if (away.current?.key === key) return
      away.current = { token: fire(), key }
    }
    const story = busy ? designingStory(messages) : null
    if (story) {
      show(`story:${story.id}`, () =>
        toast("loading", {
          title: story.editing ? "Editing the story…" : "Designing the story…",
        })
      )
      return
    }
    if (waiting) {
      if (!once(`wait:${waiting.id}`)) return
      const { title, button } = WAITING[waiting.kind]
      show(`wait:${waiting.id}`, () =>
        toast("action", {
          title,
          description: waiting.title || undefined,
          button: { title: button, onClick: () => open.current() },
        })
      )
      return
    }
    if (!finished) return
    show(`done:${messages.length}`, () =>
      error
        ? toast("error", {
            title: "Tune ran into a problem",
            description: error.message,
            button: view,
          })
        : toast("success", {
            title: "Tune’s done",
            description: turnSummary(messages, now) || undefined,
            button: view,
          })
    )
  }, [active, busy, resuming, messages, error])
}
