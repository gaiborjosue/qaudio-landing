import { defineTool } from "eve/tools"
import { openProductTableInputSchema } from "../../lib/admin/schemas"

export default defineTool({
  deferred: true,
  description:
    "Open the product table in the chat: every product (drafts included), ten to a page, with search and category, brand, condition, and status filters. The owner can change price, condition, audition, and status right in the rows and save them, or open any row in the full product editor. Use it when the owner wants to browse, compare, or change several products, or names more than a handful. Prefill the filters from the request. It saves nothing itself. After opening it, say at most one short line and stop.",
  inputSchema: openProductTableInputSchema,
  label: {
    start: () => "Open the product table",
    complete: () => "Opened the product table",
  },
  async execute(filters) {
    return { opened: true, filters }
  },
})
