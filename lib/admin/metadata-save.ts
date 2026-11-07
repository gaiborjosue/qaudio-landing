import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../supabase/database"
import { placeUploads } from "./uploads"
import {
  metadataError,
  MetadataSaveError,
  type MetadataInput,
} from "./metadata"

/** Writes through the caller's session. Existing addresses are never updated. */
export async function saveMetadata(
  supabase: SupabaseClient<Database>,
  input: MetadataInput
) {
  const { kind, original_slug, ...fields } = input
  const paths =
    input.kind === "categories"
      ? [input.artwork_path, input.scene_path]
      : [input.logo_path]
  const folder = (index: number) =>
    kind === "brands"
      ? "brands"
      : index === 0
        ? "categories"
        : "category-scenes"
  const placed = await Promise.all(
    paths.map((path, index) =>
      path
        ? placeUploads(
            supabase,
            [path],
            folder(index),
            () => new MetadataSaveError("Couldn’t save the image.")
          )
        : Promise.resolve(() => null)
    )
  )
  const row =
    input.kind === "categories"
      ? {
          slug: fields.slug,
          name: fields.name,
          wheel_label: input.wheel_label,
          artwork_path: placed[0](paths[0] ?? ""),
          scene_path: placed[1](paths[1] ?? ""),
        }
      : {
          slug: fields.slug,
          name: fields.name,
          logo_path: placed[0](paths[0] ?? ""),
          ...(input.featured !== undefined && { featured: input.featured }),
        }
  let sort_order = 0
  if (!original_slug) {
    const last = await supabase
      .from(kind === "categories" ? "catalog_categories" : "catalog_brands")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
    if (last.error) throw new MetadataSaveError(metadataError(last.error))
    sort_order = (last.data[0]?.sort_order ?? -1) + 1
  }
  const result =
    kind === "categories"
      ? original_slug
        ? await supabase
            .from("catalog_categories")
            .update(
              row as Database["public"]["Tables"]["catalog_categories"]["Update"]
            )
            .eq("slug", original_slug)
            .select("slug")
        : await supabase
            .from("catalog_categories")
            .insert({
              ...row,
              sort_order,
            } as Database["public"]["Tables"]["catalog_categories"]["Insert"])
            .select("slug")
      : original_slug
        ? await supabase
            .from("catalog_brands")
            .update(
              row as Database["public"]["Tables"]["catalog_brands"]["Update"]
            )
            .eq("slug", original_slug)
            .select("slug")
        : await supabase
            .from("catalog_brands")
            .insert({
              ...row,
              sort_order,
            } as Database["public"]["Tables"]["catalog_brands"]["Insert"])
            .select("slug")
  if (result.error) throw new MetadataSaveError(metadataError(result.error))
  if (result.data.length !== 1)
    throw new MetadataSaveError("This entry no longer exists. Reload the page.")
  return { slug: input.slug }
}
