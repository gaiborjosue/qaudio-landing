import { defineTool } from "eve/tools"
import { showListInputSchema } from "../../lib/admin/show-list"

// Generative UI: the chat draws this call's input as a list
// (components/admin/item-list.tsx). It reads and changes nothing, and the
// model gets back only a word, so the list costs no more context than the
// same list written as text.
export default defineTool({
  description:
    "Show the owner a list of 3+ comparable things (products, posts, deals, dates, accounts) as rows instead of a Markdown list. Don't repeat the rows in text; add only what the list doesn't say.",
  inputSchema: showListInputSchema,
  availableInSubagents: false,
  label: { start: () => "Show a list" },
  async execute({ items }) {
    return { shown: items.length }
  },
  toModelOutput: () => ({ type: "text", value: "Shown." }),
})
