import {
  MEDIA_SESSION_ATTRIBUTE,
  UUID,
  mediaSessionEvent,
} from "../../lib/admin/media-lifecycle"
import { callerSupabase, type CallerContext } from "./supabase"

export async function sessionMedia(
  ctx: CallerContext,
  event: "active" | "settled" | "ended" = "active"
) {
  const caller = ctx.session.auth.current
  const id = caller?.attributes[MEDIA_SESSION_ATTRIBUTE]
  if (!ctx.session.id) throw new Error("Photo session unavailable.")
  return mediaSessionEvent(
    callerSupabase(ctx),
    typeof id === "string" && UUID.test(id) ? id : null,
    ctx.session.id,
    event
  )
}
