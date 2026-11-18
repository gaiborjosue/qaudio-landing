import type { SupabaseClient } from "@supabase/supabase-js"
import { newsExcerpt, type NewsBlock } from "../news"
import type { Database, Json } from "../supabase/database.types"
import type {
  DeleteNewsPostInput,
  NewsBlockInput,
  NewsPostInput,
  NewsQuickEdit,
} from "./schemas"
import { NEWS_SALE_COLUMNS, newsSaleDetails, newsStatus } from "./news"
import { fromStoreDateTime, toStoreDateTime } from "./store-time"
import { placeUploads, type Fail } from "./uploads"

// Reading, saving, and deleting news posts, shared by the agent's news tools
// and the admin's News tab (Server Actions). Both pass a client signed in as
// the admin, so RLS applies. Relative imports, because the agent imports
// this too.

type Supabase = SupabaseClient<Database>

/** A post with every field, as news__save_news_post takes it, and its id. */
export type NewsRecord = Omit<NewsPostInput, "id" | "published_at"> & {
  id: string
  published_at: string | null
  linkedSales?: ReturnType<typeof newsSaleDetails>["linkedSales"]
}

const RECORD_COLUMNS =
  `id, slug, title, body, cover_path, cover_width, cover_height, cover_alt, cover_fit, status, published_at, ${NEWS_SALE_COLUMNS}` as const

/**
 * One post (draft, scheduled, or published) with its cover, body blocks as
 * stored (image `src` is a media path), and store-time published_at.
 */
export async function readNewsPost(
  supabase: Supabase,
  where: { id: string } | { slug: string },
  fail: Fail
): Promise<NewsRecord | null> {
  const query = supabase.from("news_posts").select(RECORD_COLUMNS)
  const { data: post, error } = await (
    "id" in where ? query.eq("id", where.id) : query.eq("slug", where.slug)
  ).maybeSingle()
  if (error) throw fail("News post", error)
  if (!post) return null
  const { expiresAt, linkedSales } = newsSaleDetails(post)
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    body: (Array.isArray(post.body) ? post.body : []) as NewsBlockInput[],
    cover:
      post.cover_path && post.cover_width && post.cover_height
        ? {
            path: post.cover_path,
            width: post.cover_width,
            height: post.cover_height,
            alt: post.cover_alt,
            fit: post.cover_fit === "contain" ? "contain" : "cover",
          }
        : null,
    status: post.status === "published" ? "published" : "draft",
    published_at: post.published_at && toStoreDateTime(post.published_at),
    expires_at: expiresAt,
    linkedSales,
  }
}

/** An instant for published_at: "now", store time, or null. */
function publishedInstant(value: string | null) {
  return value === "now"
    ? new Date().toISOString()
    : value && fromStoreDateTime(value)
}

/**
 * Adds a post, or replaces an existing one by id. Newly uploaded photos
 * (uploads/) are copied into news/ first, and the card excerpt is written
 * from the body. Returns the saved id, slug, photo paths, and whether the
 * post is live now.
 */
export async function saveNewsPost(
  supabase: Supabase,
  { id, body, cover, published_at, expires_at, ...post }: NewsPostInput,
  fail: Fail
) {
  // Move newly uploaded photos into news/ before the post points at them.
  const imagePaths = body.flatMap((block) =>
    block.type === "image" ? [block.image.src] : []
  )
  const place = await placeUploads(
    supabase,
    cover ? [cover.path, ...imagePaths] : imagePaths,
    "news",
    fail
  )
  const blocks: NewsBlockInput[] = body.map((block) =>
    block.type === "image"
      ? { ...block, image: { ...block.image, src: place(block.image.src) } }
      : block
  )
  const publishedAt = publishedInstant(published_at)

  const row = {
    slug: post.slug,
    title: post.title.trim(),
    status: post.status,
    body: blocks as unknown as Json,
    excerpt: newsExcerpt(blocks as NewsBlock[]),
    cover_path: cover ? place(cover.path) : null,
    cover_width: cover?.width ?? null,
    cover_height: cover?.height ?? null,
    cover_alt: cover?.alt.trim() ?? "",
    cover_fit: cover?.fit ?? "cover",
    published_at: publishedAt,
    ...(expires_at !== undefined && {
      expires_at: expires_at && fromStoreDateTime(expires_at),
    }),
  }
  const result = id
    ? await supabase
        .from("news_posts")
        .update(row)
        .eq("id", id)
        .select(`id, slug, status, published_at, ${NEWS_SALE_COLUMNS}`)
    : await supabase
        .from("news_posts")
        .insert(row)
        .select(`id, slug, status, published_at, ${NEWS_SALE_COLUMNS}`)
  if (result.error) throw fail("News post", result.error)
  const saved = result.data[0]
  if (!saved) {
    throw new Error("News post: no post with that id; it may be deleted.")
  }
  const published = saved.published_at && toStoreDateTime(saved.published_at)
  const timing = newsStatus(
    { status: saved.status, publishedAt: published, ...newsSaleDetails(saved) },
    toStoreDateTime(new Date())
  )
  return {
    id: saved.id,
    slug: saved.slug,
    live: timing === "published",
    timing,
    expires_at: saved.expires_at && toStoreDateTime(saved.expires_at),
    cover: row.cover_path,
    images: blocks.flatMap((block) =>
      block.type === "image" ? [block.image.src] : []
    ),
    published_at: published,
  }
}

/** Status changes from the News table, each on its own post. */
export async function saveNewsQuickEdits(
  supabase: Supabase,
  edits: NewsQuickEdit[],
  fail: Fail
) {
  const results = await Promise.all(
    edits.map(({ id, status, published_at }) =>
      supabase
        .from("news_posts")
        .update({
          status,
          ...(published_at !== undefined && {
            published_at: publishedInstant(published_at),
          }),
        })
        .eq("id", id)
        .select("id")
    )
  )
  for (const result of results) {
    if (result.error) throw fail("News post", result.error)
    if (result.data.length !== 1) {
      throw new Error("News post: one of these posts no longer exists.")
    }
  }
  return { saved: edits.length }
}

/** Deletes a post and, if approved, cancels its still-scheduled prices. */
export async function deleteNewsPost(
  supabase: Supabase,
  { id, sale_choice }: DeleteNewsPostInput,
  fail: Fail
) {
  const { data, error } = await supabase.rpc("delete_news_with_sales", {
    p_post_id: id,
    ...(sale_choice && { p_sale_choice: sale_choice }),
  })
  if (error?.code === "P0001") return { needsSaleChoice: true } as const
  if (error) throw fail("News post", error)
  return data[0] ?? null
}
