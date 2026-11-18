import { defineAgent } from "eve"
import { FAST_CONTEXT_TOKENS, fastModel, mainChatModel } from "./lib/models"

export default defineAgent({
  description:
    "Tune, Q Audio's web assistant: edits store hours, news, deals, and shop products (adding, changing, and arranging them), and manages Instagram and Google Business hours and posts for the owner.",
  model: mainChatModel,
  compaction: {
    model: fastModel,
    modelContextWindowTokens: FAST_CONTEXT_TOKENS,
  },
  // sharp (Instagram photo conversion) is a native addon: keep it unbundled.
  build: { externalDependencies: ["sharp"] },
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
