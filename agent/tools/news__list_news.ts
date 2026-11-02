import { defineTool } from "eve/tools"
import { z } from "zod"
import { toStoreDateTime } from "../../lib/admin/store-time"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
  deferred: true,
  description:
    "List news posts, newest first, including drafts and scheduled posts, with optional filters. Use it to find a post's id or slug and to check that a new slug is free.",
  inputSchema: z.object({
    search: z
      .string()
      .max(80)
      .optional()
      .describe("Part of a title, case-insensitive."),
    status: z.enum(["draft", "published"]).optional(),
  }),
  label: { start: () => "Read the news posts" },
  async execute({ search, status }, ctx) {
    const supabase = callerSupabase(ctx)
    let query = supabase
      .from("news_posts")
      .select("id, slug, title, status, published_at")
      .order("published_at", { ascending: false, nullsFirst: true })
      .limit(100)
    if (search) {
      const escaped = search.replace(/[\\%_]/g, (match) => `\\${match}`)
      query = query.ilike("title", `%${escaped}%`)
    }
    if (status) query = query.eq("status", status)
    const { data, error } = await query
    if (error) throw failure("News", error)
    const now = Date.now()
    return {
      posts: data.map((post) => ({
        id: post.id,
        slug: post.slug,
        title: post.title,
        status: post.status,
        published_at: post.published_at && toStoreDateTime(post.published_at),
        live:
          post.status === "published" &&
          post.published_at !== null &&
          Date.parse(post.published_at) <= now,
      })),
    }
  },
})
