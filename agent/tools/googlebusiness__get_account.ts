import { defineTool } from "eve/tools"
import { z } from "zod"
import {
  googleBusinessWritesEnabled,
  zernioGoogleBusinessStatus,
} from "../../lib/admin/google-business-api"
import { googleBusinessAccess } from "../lib/google-business"

export default defineTool({
  deferred: true,
  description:
    "GET only: check this site's Google Business connections and account ids. Use get_location next for the selected business, verification metadata, current hours, and revision.",
  inputSchema: z.object({}),
  label: { start: () => "Check Google Business" },
  async execute(_input, ctx) {
    return {
      ...(await zernioGoogleBusinessStatus(await googleBusinessAccess(ctx))),
      read_only: !googleBusinessWritesEnabled(),
    }
  },
})
