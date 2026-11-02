import { defineAgent } from "eve"
import { FAST_CONTEXT_TOKENS, fastModel, mainChatModel } from "./lib/models"

export default defineAgent({
  description:
    "Tune, Q Audio's web assistant: edits store hours and the shop catalog for the owner.",
  model: mainChatModel,
  compaction: {
    model: fastModel,
    modelContextWindowTokens: FAST_CONTEXT_TOKENS,
  },
  // Only the tools in tools/ (read_file and web_fetch are re-added there); no
  // shell or file writing, and no copy of itself.
  defaultTools: false,
  tool: false,
  limits: {
    // Ask the owner before a conversation spends another 3M fresh input tokens.
    sessionUsage: ({ window }) =>
      window.inputTokens - window.cacheReadTokens >= 3_000_000,
  },
})
