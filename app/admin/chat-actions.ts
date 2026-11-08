"use server"

import { after } from "next/server"
import { z } from "zod"
import { getAdmin } from "@/lib/admin/auth"
import { localChatCleanupEnabled, pruneLocalChatHistory } from "@/lib/admin/local-chat-history"

const sessionId = z.string().regex(/^wrun_[0-9A-Z]{26}$/)
const cleanupInput = z.object({
  currentSessionId: sessionId.optional(),
  endedSessionId: sessionId.optional(),
}).strict()

/** Local run files only; cleanup failure never prevents a fresh chat. */
export async function cleanupLocalChatHistory(input: unknown = {}) {
  if (!(await getAdmin())) throw new Error("Sign in as an admin.")
  const parsed = cleanupInput.safeParse(input)
  if (!parsed.success) throw new Error("Invalid local chat cleanup request.")
  if (!localChatCleanupEnabled()) return
  after(async () => {
    try { await pruneLocalChatHistory(parsed.data) } catch {
      console.warn("Local chat history cleanup failed; it will retry with the next new chat.")
    }
  })
}
