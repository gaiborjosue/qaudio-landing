import type { SupabaseClient } from "@supabase/supabase-js"
import { productThumbnailPath } from "../media"
import type { Database } from "../supabase/database"
import { UPLOADS } from "./schemas"
import { isPrivateUpload, mediaBucket } from "./media-lifecycle"

// Shared by the agent's save tools and the admin chat's own Save buttons
// (Server Actions). Both pass a client signed in as the admin, so RLS
// applies. Relative imports, because the agent imports this too.

export type DatabaseError = { code?: string; message: string }

/** Words a database error for whoever reads it: the model or the owner. */
export type Fail = (what: string, error: DatabaseError) => Error

const alreadyExists = (message: string) =>
  /already exists|duplicate/i.test(message)

/** Prepare the 2x admin tile before publishing a product original that uses it. */
async function productPhotoWithThumbnail(
  supabase: SupabaseClient<Database>,
  source: string,
  filename: string
) {
  const original = `products/photo-v1-${filename}`
  const thumbnail = productThumbnailPath(original)
  if (!thumbnail) return

  const bucket = mediaBucket(source)
  const { error: trackingError } = await supabase.rpc("prepare_media_copy", {
    p_bucket: bucket,
    p_path: source,
    p_destination: thumbnail,
  })
  if (trackingError) return

  const media = supabase.storage.from("media")
  if ((await media.exists(thumbnail)).data) return original

  const { data: photo } = await supabase.storage.from(bucket).download(source)
  if (!photo) return
  const { default: sharp } = await import("sharp")
  const bytes = await sharp(await photo.arrayBuffer(), {
    limitInputPixels: 40_000_000,
  })
    .autoOrient()
    .resize(80, 80, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
  const { error } = await media.upload(thumbnail, bytes, {
    cacheControl: "31536000",
    contentType: "image/webp",
  })
  if (!error || alreadyExists(error.message)) return original
}

/**
 * Copies photos the admin chat uploaded (uploads/…) into their section's
 * folder in the media bucket when a save uses them, and returns each path's
 * final location. Other paths pass through. A photo already copied by an
 * earlier save is reused, so retries are safe; the uploads/ copies stay
 * behind for a later cleanup.
 */
export async function placeUploads(
  supabase: SupabaseClient<Database>,
  paths: Iterable<string>,
  folder:
    | "products"
    | "news"
    | "deals"
    | "instagram"
    | "categories"
    | "brands"
    | "category-scenes",
  fail: Fail
) {
  const placed = new Map<string, string>()
  for (const path of new Set(paths)) {
    if (!path.startsWith(UPLOADS)) {
      placed.set(path, path)
      continue
    }
    const filename = path.slice(path.lastIndexOf("/") + 1)
    // Thumbnail generation is optional. A photo save can still succeed if
    // Storage or the image decoder couldn't produce the smaller variant.
    const productPhoto =
      folder === "products"
        ? await productPhotoWithThumbnail(supabase, path, filename).catch(
            () => undefined
          )
        : undefined
    const destination = productPhoto ?? `${folder}/${filename}`
    const { error: trackingError } = await supabase.rpc("prepare_media_copy", {
      p_bucket: mediaBucket(path),
      p_path: path,
      p_destination: destination,
    })
    if (trackingError)
      throw fail("Photo", {
        message: "Couldn't retain that photo before saving.",
      })
    const { error } = await supabase.storage
      .from(mediaBucket(path))
      .copy(
        path,
        destination,
        isPrivateUpload(path) ? { destinationBucket: "media" } : undefined
      )
    if (error && !alreadyExists(error.message)) {
      throw fail("Photo", { message: error.message })
    }
    placed.set(path, destination)
  }
  return (path: string) => placed.get(path) ?? path
}
