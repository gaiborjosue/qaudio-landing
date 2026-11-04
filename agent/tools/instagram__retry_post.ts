import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import {
  InstagramError,
  retryInstagramPost,
} from "../../lib/admin/instagram-posts"
import { retryInstagramPostInputSchema } from "../../lib/admin/schemas"
import { instagramAccess } from "../lib/instagram"

export default defineTool({
  deferred: true,
  description:
    "Publish one of this site's failed Instagram posts again, right away, by id, as it is. Fix the cause first (for example, reconnect the account in Zernio); to change the post itself, delete it and make a new one. The owner approves first.",
  inputSchema: retryInstagramPostInputSchema,
  approval: {
    request: always(),
    prompt: () => "Try posting this to Instagram again now?",
  },
  label: {
    start: () => "Retry an Instagram post",
    complete: () => "Retried the Instagram post",
  },
  async execute({ id }, ctx) {
    const post = await retryInstagramPost(await instagramAccess(ctx), id)
    if (post.status === "failed" || post.status === "partial") {
      throw new InstagramError(
        `Instagram still didn't publish it${post.problem ? `: ${post.problem}` : "."}`
      )
    }
    return {
      retried: true,
      id: post.id,
      status: post.status,
      // The Instagram post, once it's live.
      url: post.url,
    }
  },
})
