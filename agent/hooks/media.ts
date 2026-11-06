import { defineHook } from "eve/hooks"
import { sessionMedia } from "../lib/media-session"
import type { CallerContext } from "../lib/supabase"

async function update(
  ctx: CallerContext & { session: { parent?: unknown } },
  event: "active" | "settled" | "ended"
) {
  if (ctx.session.parent || ctx.session.auth.current?.principalType !== "user")
    return
  try {
    await sessionMedia(ctx, event)
  } catch {
    // Ending a session must still work with an expired caller token. The
    // browser also marks explicit endings; idle sessions have a DB fallback.
    if (event === "active")
      throw new Error(
        "Couldn't open the photo session. Send the message again."
      )
  }
}

export default defineHook({
  events: {
    "turn.started": (_event, ctx) => update(ctx, "active"),
    "turn.settled": (_event, ctx) => update(ctx, "settled"),
    "session.ended": (_event, ctx) => update(ctx, "ended"),
  },
})
