import { placeUploads as placeAs } from "../../lib/admin/uploads"
import { failure, type AdminSupabase } from "./supabase"

/**
 * Copies photos the admin chat uploaded (uploads/…) into their section's
 * folder when an approved save uses them; see lib/admin/uploads.ts. Errors
 * are worded for the model.
 */
export function placeUploads(
  supabase: AdminSupabase,
  paths: Iterable<string>,
  folder: "products" | "news" | "instagram"
) {
  return placeAs(supabase, paths, folder, failure)
}
