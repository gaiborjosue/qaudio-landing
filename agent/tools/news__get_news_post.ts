import { defineTool } from "eve/tools"
import { z } from "zod"
import { readNewsPost } from "../../lib/admin/news-save"
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
    const post = await readNewsPost(
      callerSupabase(ctx),
      id ? { id } : { slug: slug! },
      failure
    )
    return post ? { found: true, post } : { found: false }
  },
})
