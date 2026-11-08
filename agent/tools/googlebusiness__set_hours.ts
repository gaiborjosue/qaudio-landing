import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { googleBusinessHoursInputSchema } from "../../lib/admin/schemas"
import { setGoogleBusinessHours } from "../../lib/admin/google-business-api"
import { googleBusinessAccess } from "../lib/google-business"
import { idempotencyKey } from "../lib/instagram"

export default defineTool({
  deferred: true,
  description:
    "Update Google Business regular hours and/or dated special hours after approval. Does not change website hours. Read get_location first; pass its exact target and revision. Preserves unmentioned dates. Use regular to remove a dated override. Google has no appointment-only hours: ask for exact times. Requires the server write opt-in in any environment.",
  inputSchema: googleBusinessHoursInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) =>
      `Update Google Business hours for ${input.target.business}?`,
  },
  label: {
    start: () => "Update Google Business hours",
    complete: () => "Updated Google Business hours",
  },
  async execute(input, ctx) {
    return setGoogleBusinessHours(
      await googleBusinessAccess(ctx),
      input,
      idempotencyKey(ctx)
    )
  },
})
