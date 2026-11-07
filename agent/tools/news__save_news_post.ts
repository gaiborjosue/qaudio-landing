import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import {
  newsPostInputSchema,
  type NewsBlockInput,
} from "../../lib/admin/schemas"
import { fromStoreDateTime } from "../../lib/admin/store-time"
import { newsExcerpt, type NewsBlock } from "../../lib/news"
import type { Json } from "../../lib/supabase/database.types"
import { placeUploads } from "../lib/media"
import { callerSupabase, failure } from "../lib/supabase"
import { refreshAfterSave } from "../lib/site-cache"

export default defineTool({
  deferred: true,
  description:
    "Add a news post, or replace an existing one by id. Send the complete post: title, slug, every body block, the cover, status, and published_at. The card excerpt is written automatically from the body. The owner sees the news card and article preview and must approve before anything is saved.",
  inputSchema: newsPostInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) =>
      input.id
        ? `Save changes to “${input.title}”?`
        : `Add the post “${input.title}”?`,
  },
  label: {
    start: ({ id, title }) => (id ? `Edit “${title}”` : `Add “${title}”`),
    complete: (input) => `Saved “${input.title}”`,
  },
  async execute({ id, body, cover, published_at, ...post }, ctx) {
    const supabase = callerSupabase(ctx)
    // Move newly uploaded photos into news/ before the post points at them.
    const imagePaths = body.flatMap((block) =>
      block.type === "image" ? [block.image.src] : []
    )
    const place = await placeUploads(
      supabase,
      cover ? [cover.path, ...imagePaths] : imagePaths,
      "news"
    )
    const blocks: NewsBlockInput[] = body.map((block) =>
      block.type === "image"
        ? { ...block, image: { ...block.image, src: place(block.image.src) } }
        : block
    )
    const publishedAt =
      published_at === "now"
        ? new Date().toISOString()
        : published_at && fromStoreDateTime(published_at)

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
    }
    const result = id
      ? await supabase
          .from("news_posts")
          .update(row)
          .eq("id", id)
          .select("id, slug")
      : await supabase.from("news_posts").insert(row).select("id, slug")
    if (result.error) {
      throw failure(
        "News post",
        result.error.code === "23505"
          ? { message: "that slug is already used by another post." }
          : result.error
      )
    }
    const saved = result.data[0]
    if (!saved) {
      throw new Error(
        "News post: no post with that id. Look it up again with news__list_news."
      )
    }
    const live =
      post.status === "published" &&
      publishedAt !== null &&
      Date.parse(publishedAt) <= Date.now()
    return refreshAfterSave(ctx, {
      saved: true,
      id: saved.id,
      slug: saved.slug,
      status: post.status,
      live,
      url: `/news/${saved.slug}`,
      // Saved photo paths; use these (not uploads/) in later edits.
      cover: row.cover_path,
      images: blocks.flatMap((block) =>
        block.type === "image" ? [block.image.src] : []
      ),
      revalidate: ["news"],
    })
  },
})
