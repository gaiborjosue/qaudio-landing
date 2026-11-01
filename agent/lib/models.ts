import { createOpenRouter } from "@openrouter/ai-sdk-provider"

// Every model call goes through OpenRouter (OPENROUTER_API_KEY), so switching
// models is a one-line change here. Ids are OpenRouter model ids.
const openrouter = createOpenRouter({
  compatibility: "strict",
  headers: { "X-Title": "Q Audio admin" },
})

/** Conversation, tool use, and image reading for the root agent. */
export const MAIN_MODEL_ID = "openai/gpt-6.1-terra"
/** Cheap, bounded work: copywriting and context compaction. */
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
