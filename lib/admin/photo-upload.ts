import { UPLOADS } from "@/lib/admin/schemas"
import { browserSupabase } from "@/lib/supabase/browser"
import {
  CHAT_BUCKET,
  PRIVATE_CACHE_SECONDS,
  discardStagedMedia,
  mediaSessionEvent,
  registerChatImage,
} from "./media-lifecycle"

// Photos the owner adds in the admin chat: shrunk in the browser, then
// uploaded as the admin (RLS). Chat photos are private and tracked; product
// editor photos retain their existing media/uploads/ staging behavior.

/** Largest original the chat accepts; it's shrunk well below this. */
export const PHOTO_MAX_BYTES = 20e6
const MAX_EDGE = 1600

/** A photo once it's in storage: its media path and its size. */
export type UploadedPhoto = { path: string; width: number; height: number }

async function encodePhoto(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  // Browsers without WebP encoding fall back to PNG; use JPEG there instead.
  let blob = await encode("image/webp", 0.86)
  if (blob?.type !== "image/webp") blob = await encode("image/jpeg", 0.88)
  if (!blob) throw new Error("Couldn’t read that image.")
  return { blob, width, height }
}

/**
 * Shrinks a photo to at most 1600px and uploads it, reporting the upload's
 * progress (0 to 1). The upload goes straight to Supabase Storage's REST
 * endpoint with XMLHttpRequest, because fetch (and so supabase-js) can't
 * report upload progress. Aborting `signal` (the owner removed the photo)
 * stops the upload and deletes anything that already landed.
 */
export async function uploadPhoto(
  file: File,
  {
    onProgress,
    signal,
    mediaSession,
  }: {
    onProgress: (fraction: number) => void
    signal?: AbortSignal
    mediaSession?: { id: string; eve?: string }
  }
): Promise<UploadedPhoto> {
  const cancelled = () => new DOMException("Upload cancelled.", "AbortError")
  const { blob, width, height } = await encodePhoto(file)
  if (signal?.aborted) throw cancelled()
  const { data } = await browserSupabase().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Sign in again to upload photos.")

  const extension = blob.type === "image/webp" ? "webp" : "jpg"
  const client = browserSupabase()
  const session =
    mediaSession &&
    (await mediaSessionEvent(
      client,
      mediaSession.id,
      mediaSession.eve ?? null,
      "draft"
    ))
  const path = session
    ? await registerChatImage(client, session, extension)
    : `${UPLOADS}${crypto.randomUUID()}.${extension}`
  const bucket = session ? CHAT_BUCKET : "media"
  if (signal?.aborted) {
    if (session) await discardStagedMedia(client, path).catch(() => {})
    throw cancelled()
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open(
        "POST",
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`
      )
      request.setRequestHeader("Authorization", `Bearer ${token}`)
      request.setRequestHeader(
        "apikey",
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
      )
      request.setRequestHeader("Content-Type", blob.type)
      // Disposable chat images get a short cache; editor uploads keep theirs.
      request.setRequestHeader(
        "Cache-Control",
        `max-age=${session ? PRIVATE_CACHE_SECONDS : "31536000"}`
      )
      request.setRequestHeader("x-upsert", "false")
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total)
      }
      request.onload = () =>
        request.status < 300
          ? resolve()
          : reject(new Error(`Upload failed (${request.status}).`))
      request.onerror = () => reject(new Error("Upload failed."))
      request.onabort = () => reject(cancelled())
      signal?.addEventListener("abort", () => request.abort(), { once: true })
      request.send(blob)
    })
  } catch (error) {
    // The server may have stored the file just before the abort arrived, or
    // may still be finishing it, so the cleanup waits a moment.
    if (signal?.aborted) {
      window.setTimeout(() => void discardUpload(path).catch(() => {}), 2000)
    }
    throw error
  }
  onProgress(1)
  return { path, width, height }
}

/**
 * Deletes a photo the owner uploaded but took back before sending. Only
 * staged uploads/ files: saved products/ and news/ photos are never touched
 * from here.
 */
export async function discardUpload(path: string) {
  return discardStagedMedia(browserSupabase(), path)
}
