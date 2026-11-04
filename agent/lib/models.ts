import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { auto } from "eve/models"

// Generation stays on OpenRouter (OPENROUTER_API_KEY). Only the routing
// decision uses AI Gateway (AI_GATEWAY_API_KEY) through eve's auto().
const openrouter = createOpenRouter({
  compatibility: "strict",
  headers: { "X-Title": "Q Audio admin" },
})

/** Changes, complex tool use, and image reading for the root agent. */
export const MAIN_MODEL_ID = "openai/gpt-6.1-terra"
/** Simple chat and reads, copywriting, and context compaction. */
export const FAST_MODEL_ID = "anthropic/claude-haiku-5.5"

// OpenRouter reads reasoning effort from the model settings, not from eve's
// provider-agnostic `reasoning` option.
export const mainModel = openrouter.chat(MAIN_MODEL_ID, {
  reasoning: { effort: "medium" },
  usage: { include: true },
})

export const fastModel = openrouter.chat(FAST_MODEL_ID, {
  usage: { include: true },
})

/**
 * Context budgets eve compacts against. Both models accept about a million
 * tokens; the main budget is kept lower so long chats compact (and cost)
 * sooner.
 */
export const MAIN_CONTEXT_TOKENS = 200_000
export const FAST_CONTEXT_TOKENS = 1_000_000

/** Decide once per turn; never route generation through Gateway model strings. */
export const mainChatModel = auto({
  model: "typesafe-ai/jev",
  fallback: {
    model: mainModel,
    modelContextWindowTokens: MAIN_CONTEXT_TOKENS,
  },
  options: {
    [MAIN_MODEL_ID]: {
      model: mainModel,
      modelContextWindowTokens: MAIN_CONTEXT_TOKENS,
      description:
        "Use for any creation, update, deletion, publishing, scheduling, reordering, or memory change, including collecting details and short follow-ups that continue an unfinished change (such as 'yes', a date, or a price). Also use for image interpretation, external research, complex reasoning, multiple dependent data lookups, or work across domains. When the task or its context is ambiguous, choose this model.",
    },
    [FAST_MODEL_ID]: {
      model: fastModel,
      modelContextWindowTokens: MAIN_CONTEXT_TOKENS,
      description:
        "Use only for clearly simple, read-only work: greetings, thanks, explanations or summaries of information already in the conversation, and a bounded lookup or listing in one domain (hours, products, news, deals, or Instagram posts). Loading the domain skill and discovering its read tool is fine. Do not use for changes, follow-ups supplying details for an unfinished change, image interpretation, research, or complex tool workflows. Read current site data when needed; never rely on memory for it.",
    },
  },
})
