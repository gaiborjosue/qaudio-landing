import { defineTool } from "eve/tools"
import { z } from "zod"
import { googleBusinessTargetSchema } from "../../lib/admin/schemas"
import { listGoogleBusinessPosts } from "../../lib/admin/google-business-api"
import { googleBusinessAccess } from "../lib/google-business"

export default defineTool({
  deferred: true,
  description:
    "GET only: list Google Business posts for the exact selected location, with ids, content, status, store-time schedule, revision and editability. Only Tune's drafts and scheduled posts can be edited; cross-platform or other-location posts are excluded.",
  inputSchema: z.object({
    target: googleBusinessTargetSchema,
    status: z.enum(["draft", "scheduled", "published", "failed"]).optional(),
    limit: z.int().min(1).max(25).default(10),
  }),
  label: { start: () => "Read Google Business posts" },
  async execute({ target, status, limit }, ctx) {
    return listGoogleBusinessPosts(
      await googleBusinessAccess(ctx),
      target,
      status,
      limit
    )
  },
})
