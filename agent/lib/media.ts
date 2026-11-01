import { UPLOADS } from "../../lib/admin/schemas"
import { failure, type AdminSupabase } from "./supabase"

/**
 * Copies photos the admin chat uploaded (uploads/…) into their section's
 * folder in the media bucket when an approved save uses them, and returns
 * each path's final location. Other paths pass through. A photo already
 * copied by an earlier save is reused, so retries are safe; the uploads/
 * copies stay behind for a later cleanup.
 */
export async function placeUploads(
  supabase: AdminSupabase,
  paths: Iterable<string>,
  folder: "products" | "news"
) {
  const placed = new Map<string, string>()
  for (const path of new Set(paths)) {
    if (!path.startsWith(UPLOADS)) {
      placed.set(path, path)
      continue
    }
    const destination = `${folder}/${path.slice(UPLOADS.length)}`
    const { error } = await supabase.storage
      .from("media")
      .copy(path, destination)
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw failure("Photo", { message: error.message })
    }
    placed.set(path, destination)
  }
  return (path: string) => placed.get(path) ?? path
}
