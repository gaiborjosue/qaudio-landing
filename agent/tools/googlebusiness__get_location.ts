import { defineTool } from "eve/tools"
import { z } from "zod"
import { readGoogleBusinessLocation } from "../../lib/admin/google-business-api"
import { googleBusinessAccess } from "../lib/google-business"

export default defineTool({
  deferred: true,
  description:
    "GET only: read the account's selected Google Business location, verification summary, regular and special hours, target, and revision. Copy target and revision exactly for an hours proposal. Never switches locations.",
  inputSchema: z.object({ account_id: z.string().regex(/^[a-f0-9]{24}$/i) }),
  label: { start: () => "Read Google Business hours" },
  async execute({ account_id }, ctx) {
    return readGoogleBusinessLocation(
      await googleBusinessAccess(ctx),
      account_id
    )
  },
})
