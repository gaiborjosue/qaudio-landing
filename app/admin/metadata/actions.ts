"use server"

import { updateTag } from "next/cache"
import { getAdmin } from "@/lib/admin/auth"
import { sessionSupabase } from "@/lib/supabase/server"
import { CATALOG_CACHE_TAG } from "@/lib/catalog-data"
import {
  metadataDelete,
  metadataError,
  metadataInput,
  metadataOrder,
  MetadataSaveError,
} from "@/lib/admin/metadata"
import { saveMetadata } from "@/lib/admin/metadata-save"

export async function saveMetadataFromEditor(
  input: unknown
): Promise<{ error: string } | { slug: string }> {
  if (!(await getAdmin())) return { error: "Sign in as an admin." }
  const parsed = metadataInput.safeParse(input)
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "Check the fields and images.",
    }
  try {
    const saved = await saveMetadata(await sessionSupabase(), parsed.data)
    updateTag(CATALOG_CACHE_TAG)
    return saved
  } catch (error) {
    return {
      error:
        error instanceof MetadataSaveError
          ? error.message
          : "Couldn’t save this entry. Try again.",
    }
  }
}

export async function deleteMetadataFromAdmin(
  input: unknown
): Promise<{ error: string } | { deleted: true }> {
  if (!(await getAdmin())) return { error: "Sign in as an admin." }
  const parsed = metadataDelete.safeParse(input)
  if (!parsed.success) return { error: "Choose an entry to delete." }
  const { kind, slug } = parsed.data
  if (kind === "categories" && slug === "used-equipment")
    return {
      error:
        "Used Equipment is part of the site navigation and cannot be deleted.",
    }
  const supabase = await sessionSupabase()
  const used = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq(kind === "categories" ? "category_slug" : "brand_slug", slug)
  if (used.error)
    return { error: "Couldn’t check which products use this entry." }
  if (used.count)
    return {
      error: "Products still use this entry. Reassign them in Products first.",
    }
  const result = await supabase
    .from(kind === "categories" ? "catalog_categories" : "catalog_brands")
    .delete()
    .eq("slug", slug)
    .select("slug")
  if (result.error) return { error: metadataError(result.error) }
  if (result.data.length !== 1)
    return { error: "This entry no longer exists. Reload the page." }
  updateTag(CATALOG_CACHE_TAG)
  return { deleted: true }
}

export async function saveMetadataOrder(
  input: unknown
): Promise<{ error: string } | { saved: true }> {
  if (!(await getAdmin())) return { error: "Sign in as an admin." }
  const parsed = metadataOrder.safeParse(input)
  if (!parsed.success)
    return { error: "The order must include every entry once." }
  const { kind, expected, ordered } = parsed.data
  const supabase = await sessionSupabase()
  const result = await supabase.rpc("reorder_catalog_metadata", {
    kind,
    expected,
    ordered,
  })
  if (result.error) return { error: metadataError(result.error) }
  updateTag(CATALOG_CACHE_TAG)
  return { saved: true }
}
