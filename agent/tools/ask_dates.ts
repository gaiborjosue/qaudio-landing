import { defineWorkflowTool } from "eve/tools"
import { z } from "zod"
import { formatStoreDateTime, STORE_DATETIME } from "../../lib/admin/store-time"
import { askDates } from "../lib/ask-dates"

// A question with a date-range calendar in the admin chat, like
// ask_question but for when something starts and ends (a sale).
export default defineWorkflowTool({
  description:
    'Ask the owner when something starts and ends, such as a sale; the chat shows a date-range calendar. Returns starts_at ("now" or store-time "YYYY-MM-DDTHH:MM") and ends_at, or the owner\'s typed answer to interpret yourself. Suggest dates you already know.',
  inputSchema: z.object({
    question: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .describe('A short question, e.g. "When does the sale run?"'),
    starts_at: z
      .union([z.literal("now"), z.string().regex(STORE_DATETIME)])
      .optional()
      .describe("A start to suggest, if you know one."),
    ends_at: z
      .string()
      .regex(STORE_DATETIME)
      .optional()
      .describe("An end to suggest, if you know one."),
  }),
  label: {
    start: () => "Ask for the dates",
    complete: (_input, output) =>
      "ends_at" in output
        ? `${output.starts_at === "now" ? "Now" : formatStoreDateTime(output.starts_at)} until ${formatStoreDateTime(output.ends_at)}`
        : "Got the dates",
  },
  execute: askDates,
})
