import { defineAgent } from "eve"
import { FAST_CONTEXT_TOKENS, fastModel } from "../../lib/models"

export default defineAgent({
  description:
    "Writes Q Audio product copy: a card line, an intro, feature bullets, and a closing line, returned as JSON. Send the product's name, brand, category, condition, and all notes, spec text, or manufacturer page text to work from; it doesn't see the conversation.",
  model: fastModel,
  modelContextWindowTokens: FAST_CONTEXT_TOKENS,
  defaultTools: false,
})
