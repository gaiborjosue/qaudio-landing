import { UPLOADS } from "@/lib/admin/schemas"
import { browserSupabase } from "@/lib/supabase/browser"

// Photos the owner adds in the admin chat: shrunk in the browser, then
// uploaded as the admin (RLS) to media/uploads/, where the save tool that
// uses one copies it into place.

/** Largest original the chat accepts; it's shrunk well below this. */
export const PHOTO_MAX_BYTES = 20e6
const MAX_EDGE = 1600

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
  }: { onProgress: (fraction: number) => void; signal?: AbortSignal }
) {
  const cancelled = () => new DOMException("Upload cancelled.", "AbortError")
  const { blob, width, height } = await encodePhoto(file)
  if (signal?.aborted) throw cancelled()
  const { data } = await browserSupabase().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Sign in again to upload photos.")

  const extension = blob.type === "image/webp" ? "webp" : "jpg"
  const path = `${UPLOADS}${crypto.randomUUID()}.${extension}`
  try {
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open(
        "POST",
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/media/${path}`
      )
      request.setRequestHeader("Authorization", `Bearer ${token}`)
      request.setRequestHeader(
        "apikey",
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
      )
      request.setRequestHeader("Content-Type", blob.type)
      // Names never repeat, so a year's cache is safe.
      request.setRequestHeader("Cache-Control", "max-age=31536000")
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
  if (!path.startsWith(UPLOADS)) return
  const { error } = await browserSupabase().storage.from("media").remove([path])
  if (error) throw error
}
