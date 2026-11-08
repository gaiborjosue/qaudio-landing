import { createHash } from "node:crypto"
import { hostname } from "node:os"
import { resolve } from "node:path"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../supabase/database"

// Shared by the Next app and Eve; no server-only import in agent-shared code.
export const CHAT_GENERATION_ATTRIBUTE = "qaudioChatGeneration"
export const currentChatInputSchema = z
  .object({
    generation: z.uuid().nullable(),
    sessionId: z
      .string()
      .regex(/^wrun_[0-9A-Z]{26}$/)
      .nullable(),
  })
  .strict()
const stateSchema = z.object({
  generation: z.uuid(),
  session_id: z
    .string()
    .regex(/^wrun_[0-9A-Z]{26}$/)
    .nullable(),
})
export type CurrentChatInput = z.infer<typeof currentChatInputSchema>
export type CurrentChat = z.infer<typeof stateSchema>
type Client = SupabaseClient<Database>
const changed = () =>
  new Error(
    "Your current chat changed on another device. Reload to continue it."
  )
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 32)

/** Keep local PCs and preview branches separate even when they share Supabase. */
export function currentChatEnvironment(
  env = process.env,
  localRoot = process.cwd()
) {
  const override = env.ADMIN_CHAT_ENVIRONMENT?.trim()
  if (override) {
    if (!/^[a-z0-9][a-z0-9:_./-]{0,159}$/.test(override))
      throw new Error("Invalid admin chat environment.")
    return override
  }
  if (env.VERCEL_ENV === "preview") {
    const branch =
      env.VERCEL_BRANCH_URL || env.VERCEL_GIT_COMMIT_REF || env.VERCEL_URL
    if (!branch) throw new Error("Set ADMIN_CHAT_ENVIRONMENT for this preview.")
    return `preview:${digest(`${env.VERCEL_PROJECT_ID ?? ""}:${branch}`)}`
  }
  if (env.NODE_ENV === "development" || env.VERCEL_ENV === "development")
    return `local:${digest(`${hostname()}:${resolve(localRoot)}`)}`
  return "production"
}

export async function readCurrentChat(client: Client, userId: string) {
  const { data, error } = await client
    .from("admin_chat_sessions")
    .select("session_id, generation")
    .eq("user_id", userId)
    .eq("environment", currentChatEnvironment())
    .maybeSingle()
  if (error)
    throw new Error("Couldn't load your current chat. Reload to try again.")
  return data ? stateSchema.parse(data) : null
}

async function event(
  client: Client,
  kind: "prepare" | "claim" | "reset",
  input?: CurrentChatInput
) {
  const { data, error } = await client.rpc("admin_chat_session", {
    p_environment: currentChatEnvironment(),
    p_event: kind,
    p_session_id: input?.sessionId ?? undefined,
    p_generation: input?.generation ?? undefined,
  })
  if (error || !data?.[0]) {
    if (error?.code === "P0001") throw changed()
    throw new Error("Couldn't update your current chat. Reload to try again.")
  }
  return stateSchema.parse(data[0])
}

/** Reserve a revision before first input; this never creates an Eve session. */
export async function prepareCurrentChat(
  client: Client,
  input: CurrentChatInput
) {
  const current = await event(client, "prepare")
  if (
    (input.generation && input.generation !== current.generation) ||
    (current.session_id && current.session_id !== input.sessionId) ||
    (input.sessionId && input.generation && !current.session_id)
  )
    throw changed()
  return current
}

/** The agent's authenticated lifecycle binds its real ID before domain work. */
export async function claimCurrentChat(
  client: Client,
  input: CurrentChatInput
) {
  await event(client, "claim", currentChatInputSchema.parse(input))
}

/** Called only after the owner explicitly requests and confirms retirement. */
export async function resetCurrentChat(
  client: Client,
  input: CurrentChatInput
) {
  return event(client, "reset", currentChatInputSchema.parse(input))
}

/** Failed history loads open a blank chat; a newer device's pointer wins a race. */
export async function recoverCurrentChat(
  client: Client,
  userId: string,
  input: CurrentChatInput
) {
  const current = await readCurrentChat(client, userId)
  if (
    current &&
    ((input.generation && input.generation !== current.generation) ||
      input.sessionId !== current.session_id)
  )
    return current
  try {
    return await resetCurrentChat(client, {
      generation: current?.generation ?? null,
      sessionId: current?.session_id ?? null,
    })
  } catch {
    // Another device can claim/reset between our read and compare-and-swap.
    const latest = await readCurrentChat(client, userId)
    if (
      latest &&
      (latest.generation !== current?.generation ||
        latest.session_id !== current?.session_id)
    )
      return latest
    throw new Error("Couldn't reopen your chat. Try again.")
  }
}
