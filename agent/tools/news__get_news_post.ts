import { defineTool } from "eve/tools"
import { z } from "zod"
import { toStoreDateTime } from "../../lib/admin/store-time"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
  deferred: true,
  description:
    "Read one news post (draft, scheduled, or published) with its cover, body blocks, and store-time published_at, by slug or id. Read it before editing, then send the full updated post to news__save_news_post.",
  inputSchema: z
    .object({
      slug: z.string().max(120).optional(),
      id: z.uuid().optional(),
    })
    .refine((input) => input.slug || input.id, "Give a slug or an id."),
  label: { start: ({ slug }) => (slug ? `Read ${slug}` : "Read a post") },
  async execute({ slug, id }, ctx) {
    const supabase = callerSupabase(ctx)
    let query = supabase
      .from("news_posts")
      .select(
        "id, slug, title, body, cover_path, cover_width, cover_height, cover_alt, cover_fit, status, published_at"
      )
    query = id ? query.eq("id", id) : query.eq("slug", slug!)
    const { data: post, error } = await query.maybeSingle()
    if (error) throw failure("News post", error)
    if (!post) return { found: false }
    return {
      found: true,
      post: {
        id: post.id,
        slug: post.slug,
        title: post.title,
        body: post.body,
        cover:
          post.cover_path && post.cover_width && post.cover_height
            ? {
                path: post.cover_path,
                width: post.cover_width,
                height: post.cover_height,
                alt: post.cover_alt,
                fit: post.cover_fit,
              }
            : null,
        status: post.status,
        published_at: post.published_at && toStoreDateTime(post.published_at),
      },
    }
  },
})
