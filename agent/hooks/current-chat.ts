import { defineHook } from "eve/hooks"
import {
  CHAT_GENERATION_ATTRIBUTE,
  claimCurrentChat,
} from "../../lib/admin/current-chat"
import { callerSupabase, type CallerContext } from "../lib/supabase"

async function remember(
  ctx: CallerContext & { session: { parent?: unknown } }
) {
  if (ctx.session.parent || ctx.session.auth.current?.principalType !== "user")
    return
  const generation =
    ctx.session.auth.current.attributes[CHAT_GENERATION_ATTRIBUTE]
  if (!ctx.session.id || typeof generation !== "string")
    throw new Error("Reload the dashboard to continue your current chat.")
  await claimCurrentChat(callerSupabase(ctx), {
    generation,
    sessionId: ctx.session.id,
  })
}

export default defineHook({
  events: {
    "session.started": (_event, ctx) => remember(ctx),
    "turn.started": (_event, ctx) => remember(ctx),
  },
})
