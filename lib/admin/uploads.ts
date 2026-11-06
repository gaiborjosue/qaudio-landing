import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../supabase/database.types"
import { UPLOADS } from "./schemas"
import { isPrivateUpload, mediaBucket } from "./media-lifecycle"

// Shared by the agent's save tools and the admin chat's own Save buttons
// (Server Actions). Both pass a client signed in as the admin, so RLS
// applies. Relative imports, because the agent imports this too.

export type DatabaseError = { code?: string; message: string }

/** Words a database error for whoever reads it: the model or the owner. */
export type Fail = (what: string, error: DatabaseError) => Error

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
    const destination = `${folder}/${path.split("/").pop()}`
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
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw fail("Photo", { message: error.message })
    }
    placed.set(path, destination)
  }
  return (path: string) => placed.get(path) ?? path
}
