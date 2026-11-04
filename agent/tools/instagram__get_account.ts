import { defineTool } from "eve/tools"
import { z } from "zod"
import { instagramAccountHealth } from "../../lib/admin/instagram-posts"
import { instagramAccess } from "../lib/instagram"

export default defineTool({
  deferred: true,
  description:
    "Check this site's Instagram connection before posting: the connected username to post as, whether it can post, issues to fix in Zernio (such as reconnecting), and how many posts Instagram still allows in its rolling window.",
  inputSchema: z.object({}),
  label: { start: () => "Check the Instagram account" },
  async execute(_input, ctx) {
    return instagramAccountHealth(await instagramAccess(ctx))
  },
})
