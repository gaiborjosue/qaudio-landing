import "server-only"
import { PRODUCT_COLUMNS } from "../catalog-columns"
import { connection } from "next/server"
import {
  toDayHours,
  type AdminDealItem,
  type AdminNewsItem,
  type AdminProduct,
  type AdminSchedule,
} from "@/lib/admin/preview"
import { NEWS_SALE_COLUMNS, newsSaleDetails } from "./news"
import { toStoreDateTime } from "@/lib/admin/store-time"
import { descriptionFromColumns } from "@/lib/catalog"
import { mediaUrl } from "@/lib/media"
import { productTaxonomyAssets } from "@/lib/catalog-assets"
import type { MetadataData } from "@/lib/admin/metadata"
import { publicSupabase } from "@/lib/supabase/public"
import { sessionSupabase } from "@/lib/supabase/server"
import type { DayHours } from "@/lib/store-hours"

/**
 * Every news post, drafts and scheduled ones included, newest first, read
 * as the admin for the News tab and Edit menu.
 */
export async function getAdminNews(): Promise<AdminNewsItem[]> {
  const supabase = await sessionSupabase()
  const posts: AdminNewsItem[] = []
  const pageSize = 200
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("news_posts")
      .select(
        `id, slug, title, status, published_at, cover_path, ${NEWS_SALE_COLUMNS}`
      )
      .order("published_at", { ascending: false, nullsFirst: true })
      .order("id")
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(`Admin news: ${error.message}`)
    posts.push(
      ...data.map((post) => ({
        id: post.id,
        slug: post.slug,
        title: post.title,
        status: post.status,
        publishedAt: post.published_at && toStoreDateTime(post.published_at),
        hasCover: post.cover_path !== null,
        ...newsSaleDetails(post),
      }))
    )
    if (data.length < pageSize) return posts
  }
}

/**
 * Every QDeal promotion (drafts, scheduled, live, and expired), in /qdeal's
 * order, read as the admin for the Edit menu.
 */
export async function getAdminDeals(): Promise<AdminDealItem[]> {
  const supabase = await sessionSupabase()
  const { data, error } = await supabase
    .from("deals")
    .select(
      "id, title, status, starts_at, ends_at, image_path, image_width, image_height, image_alt"
    )
    .order("sort_order")
    .order("created_at")
  if (error) throw new Error(`Admin deals: ${error.message}`)
  return data.map((deal) => ({
    id: deal.id,
    title: deal.title,
    status: deal.status,
    startsAt: deal.starts_at && toStoreDateTime(deal.starts_at),
    endsAt: deal.ends_at && toStoreDateTime(deal.ends_at),
    image:
      deal.image_path && deal.image_width && deal.image_height
        ? {
            src: mediaUrl(deal.image_path),
            width: deal.image_width,
            height: deal.image_height,
            alt: deal.image_alt,
          }
        : null,
  }))
}

/**
 * Every product, drafts included, in the shop's order, read fresh as the
 * signed-in admin (RLS shows them drafts) for the reorder previews.
 */
export async function getAdminProducts(): Promise<AdminProduct[]> {
  const supabase = await sessionSupabase()
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .order("sort_order")
    .order("id")
  if (error || !data)
    throw new Error(`Admin products: ${error?.message ?? "unavailable"}`)
  return data.map(
    ({
      product_images,
      description_intro,
      features,
      description_closing,
      sale_price_cents,
      sale_starts_at,
      sale_ends_at,
      ...product
    }) => ({
      ...productTaxonomyAssets(product),
      description: descriptionFromColumns({
        description_intro,
        features,
        description_closing,
      }),
      sale_window:
        sale_price_cents !== null && sale_ends_at !== null
          ? {
              price_cents: sale_price_cents,
              starts_at: sale_starts_at && toStoreDateTime(sale_starts_at),
              ends_at: toStoreDateTime(sale_ends_at),
            }
          : null,
      images: product_images
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(({ id, path, alt, width, height, caption }) => ({
          caption,
          id,
          path,
          alt,
          width,
          height,
          src: mediaUrl(path),
        })),
    })
  )
}

/**
 * Current store hours with change ids, read fresh (uncached) for the admin
 * chat's previews. Hours are public, so the anonymous client reads them all.
 */
export async function getAdminSchedule(): Promise<AdminSchedule> {
  // Request time only: "today" comes from the clock.
  await connection()
  const supabase = publicSupabase()
  // Two days back covers the gap between UTC and store dates.
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)
  const [week, changes] = await Promise.all([
    supabase
      .from("store_weekly_hours")
      .select("weekday, kind, opens_at, closes_at")
      .order("weekday"),
    supabase
      .from("store_hours_changes")
      .select("id, starts_on, ends_on, kind, opens_at, closes_at, note")
      .gte("ends_on", since)
      .order("starts_on"),
  ])
  if (week.error) throw new Error(`Store hours: ${week.error.message}`)
  if (changes.error) {
    throw new Error(`Store hour changes: ${changes.error.message}`)
  }
  const weekly: DayHours[] = Array.from({ length: 7 }, () => "closed")
  for (const row of week.data) weekly[row.weekday] = toDayHours(row)
  return {
    weekly,
    changes: changes.data.map((row) => ({
      id: row.id,
      start: row.starts_on,
      ...(row.ends_on !== row.starts_on && { end: row.ends_on }),
      hours: toDayHours(row),
      ...(row.note && { note: row.note }),
    })),
  }
}

/** Raw asset paths and order for the Metadata editor, read as the admin. */
export async function getAdminMetadata(): Promise<MetadataData> {
  const supabase = await sessionSupabase()
  const [categories, brands] = await Promise.all([
    supabase
      .from("catalog_categories")
      .select("*")
      .order("sort_order")
      .order("slug"),
    supabase
      .from("catalog_brands")
      .select("*")
      .order("sort_order")
      .order("slug"),
  ])
  if (categories.error || brands.error)
    throw new Error("Couldn’t load catalog metadata.")
  return { categories: categories.data, brands: brands.data }
}
