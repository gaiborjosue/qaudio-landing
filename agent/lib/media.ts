import { placeUploads as placeAs } from "../../lib/admin/uploads"
import {
  attachChatImages,
  CHAT_BUCKET,
  PRIVATE_CACHE_SECONDS,
  registerChatImage,
} from "../../lib/admin/media-lifecycle"
import { failure, type AdminSupabase } from "./supabase"

/**
 * Copies photos the admin chat uploaded (uploads/…) into their section's
 * folder when an approved save uses them; see lib/admin/uploads.ts. Errors
 * are worded for the model.
 */
export function placeUploads(
  supabase: AdminSupabase,
  paths: Iterable<string>,
  folder: "products" | "news" | "deals" | "instagram"
) {
  return placeAs(supabase, paths, folder, failure)
}

/** Keep generated artwork in the same private staging as chat uploads. */
export async function stageChatJpeg(
  supabase: AdminSupabase,
  session: string,
  jpeg: Buffer
): Promise<{ path: string } | { problem: string }> {
  const path = await registerChatImage(supabase, session, "jpg")
  const { error } = await supabase.storage
    .from(CHAT_BUCKET)
    .upload(path, jpeg, {
      contentType: "image/jpeg",
      cacheControl: PRIVATE_CACHE_SECONDS,
      upsert: false,
    })
  if (error)
    return {
      problem: /jwt|token/i.test(error.message)
        ? "The admin session expired; send any message and try again."
        : "Couldn't save the design to the media library; try again.",
    }
  await attachChatImages(supabase, session, [path])
  return { path }
}
