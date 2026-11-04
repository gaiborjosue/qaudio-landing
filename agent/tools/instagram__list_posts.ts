import { defineTool } from "eve/tools"
import { z } from "zod"
import { listInstagramPosts } from "../../lib/admin/instagram-posts"
import { instagramAccess } from "../lib/instagram"

export default defineTool({
  deferred: true,
  description:
    "List this site's Instagram posts made through Zernio, newest first (scheduled ones soonest first), with status, store-time dates, caption, the Instagram link once published, and why a failed one failed. Posts Tune made include their photos and fit; only those, while draft or scheduled, can be edited. Use it to find a post's id.",
  inputSchema: z.object({
    status: z
      .enum(["draft", "scheduled", "published", "failed"])
      .optional()
      .describe("Only posts with this status."),
    limit: z.int().min(1).max(50).default(20),
  }),
  label: {
    start: ({ status }) =>
      status
        ? `Read the ${status} Instagram posts`
        : "Read the Instagram posts",
  },
  async execute({ status, limit }, ctx) {
    return listInstagramPosts(await instagramAccess(ctx), { status, limit })
  },
})
