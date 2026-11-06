import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../supabase/database.types"
import { mediaUrl } from "../media"

export const CHAT_BUCKET = "chat-uploads"
export const CHAT_PREFIX = "uploads/chat/"
export const MEDIA_SESSION_ATTRIBUTE = "mediaUploadSession"
export const PRIVATE_CACHE_SECONDS = "300"
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isPrivateUpload = (path: string) =>
  /^uploads\/chat\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/.test(path)
export const mediaBucket = (path: string) =>
  isPrivateUpload(path) ? CHAT_BUCKET : "media"
type Client = SupabaseClient<Database>

/** The RPC verifies the owner and binds a draft to at most one Eve session. */
export async function mediaSessionEvent(
  client: Client,
  id: string | null,
  eve: string | null,
  event: "draft" | "active" | "settled" | "ended"
) {
  const { data, error } = await client.rpc("media_session_event", {
    p_id: id ?? crypto.randomUUID(),
    p_eve: eve ?? undefined,
    p_event: event,
  })
  if (error || !data)
    throw new Error("Couldn't update the photo session. Try again.")
  return data
}

export async function registerChatImage(
  client: Client,
  session: string,
  extension: "webp" | "jpg"
) {
  const path = `${CHAT_PREFIX}${session}/${crypto.randomUUID()}.${extension}`
  const { error } = await client.rpc("register_media_upload", {
    p_bucket: CHAT_BUCKET,
    p_path: path,
    p_session: session,
  })
  if (error) throw new Error("Couldn't prepare the photo upload. Try again.")
  return path
}

export async function attachChatImages(
  client: Client,
  session: string,
  paths: string[]
) {
  const privatePaths = [...new Set(paths.filter(isPrivateUpload))]
  if (!privatePaths.length) return
  const { error } = await client.rpc("attach_media_uploads", {
    p_session: session,
    p_paths: privatePaths,
  })
  if (error) throw new Error("Couldn't attach those photos. Add them again.")
}

export async function pinMedia(client: Client, path: string) {
  const { error } = await client.rpc("pin_media_asset", {
    p_bucket: mediaBucket(path),
    p_path: path,
  })
  if (error) throw new Error("That photo is unavailable. Add it again.")
}

/** Store paths in history; create fresh provider URLs at model projection time. */
export async function readableMediaUrl(client: Client, path: string) {
  if (!isPrivateUpload(path)) return mediaUrl(path)
  await pinMedia(client, path)
  const { data, error } = await client.storage
    .from(CHAT_BUCKET)
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) throw new Error("Couldn't read that photo.")
  return data.signedUrl
}

export async function discardStagedMedia(client: Client, path: string) {
  if (!path.startsWith("uploads/")) return
  const bucket = mediaBucket(path)
  if (isPrivateUpload(path)) {
    const { error } = await client.rpc("discard_media_upload", {
      p_bucket: bucket,
      p_path: path,
    })
    if (error) throw new Error("That photo is still in use.")
  }
  const { error } = await client.storage.from(bucket).remove([path])
  if (error) throw new Error("Couldn't delete the staged photo.")
}

/** Keep external saves protected before the provider is called. */
export async function retainInstagramMedia(
  client: Client,
  id: string,
  paths: string[]
) {
  const { error } = await client.rpc("set_instagram_media", {
    p_id: id,
    p_paths: paths,
  })
  if (error) throw new Error("Couldn't retain the Instagram photos. Try again.")
}
