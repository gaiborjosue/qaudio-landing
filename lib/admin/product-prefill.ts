import "server-only"
import {
  extractJsonMiddleware,
  generateText,
  Output,
  wrapLanguageModel,
} from "ai"
import { fastModel } from "@/agent/lib/models"
import { PREFILL_SYSTEM, prefillDraftSchema } from "./product-page"

// Prefill with Tune's model call: the fast copywriting model on OpenRouter
// (as for the card line) reads the manufacturer's page and drafts
// the product form as structured output. Some models wrap JSON in code
// fences, so those are stripped before parsing.
const model = wrapLanguageModel({
  model: fastModel,
  middleware: extractJsonMiddleware(),
})

/** The model's draft of the form, from prefillPrompt's prompt. */
export async function draftProductFromPage(
  prompt: string,
  signal: AbortSignal
) {
  const { output } = await generateText({
    model,
    system: PREFILL_SYSTEM,
    prompt,
    output: Output.object({ schema: prefillDraftSchema }),
    maxOutputTokens: 4000,
    abortSignal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
  })
  return output
}
