import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { saveNewsPost } from "../../lib/admin/news-save"
import { newsPostInputSchema } from "../../lib/admin/schemas"
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
  async execute(input, ctx) {
    const saved = await saveNewsPost(
      callerSupabase(ctx),
      input,
      (what, error) =>
        failure(
          what,
          error.code === "23505"
            ? { message: "that slug is already used by another post." }
            : error
        )
    ).catch((error: unknown) => {
      throw error instanceof Error && /no post with that id/.test(error.message)
        ? new Error(
            "News post: no post with that id. Look it up again with news__list_news."
          )
        : error
    })
    return refreshAfterSave(ctx, {
      saved: true,
      id: saved.id,
      slug: saved.slug,
      status: input.status,
      live: saved.live,
      url: `/news/${saved.slug}`,
      // Saved photo paths; use these (not uploads/) in later edits.
      cover: saved.cover,
      images: saved.images,
      revalidate: ["news"],
    })
  },
})
