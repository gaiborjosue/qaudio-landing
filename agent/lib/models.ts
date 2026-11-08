import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { auto } from "eve/models"
import { chatgpt } from "eve/models/openai"
import { wrapLanguageModel } from "ai"
import {
  FAST_MODEL_ID,
  MAIN_MODEL_ID,
  PLAN_MODEL_ID,
} from "../../lib/admin/model-cost"
import { MIN_PLAN_TASKS } from "../../lib/admin/task-plan"
import { FLOWS } from "../../lib/admin/flows"
import { openRouterUsage } from "./model-usage"
import { taskPlanningGate } from "./task-planning"

// Only an exact opt-in in Eve's local dev process uses the ChatGPT login.
// Production always uses OpenRouter, even if DEBUG_DEV_MODE was left on.
const useChatGpt =
  process.env.DEBUG_DEV_MODE === "true" &&
  process.env.EVE_DEV === "1" &&
  process.env.NODE_ENV !== "production"

// Jev, Haiku, and non-development OpenAI models share OPENROUTER_API_KEY.
const openrouter = createOpenRouter({
  compatibility: "strict",
  headers: { "X-Title": "Q Audio admin" },
})

const flowRouting = FLOWS.map((flow) => `${flow.id}: ${flow.trigger}.`).join(
  " "
)

export {
  MAIN_MODEL_ID,
  FAST_MODEL_ID,
  PLAN_MODEL_ID,
} from "../../lib/admin/model-cost"

// OpenRouter reads reasoning effort from the model settings, not from eve's
// provider-agnostic `reasoning` option.
function openAiModel(id: typeof MAIN_MODEL_ID | typeof PLAN_MODEL_ID) {
  return useChatGpt
    ? chatgpt(id)
    : wrapLanguageModel({
        model: openrouter.chat(id, {
          reasoning: { effort: "medium" },
          usage: { include: true },
        }),
        middleware: openRouterUsage,
      })
}

/** Changes, preset flows, and image reading for the root agent. */
export const mainModel = openAiModel(MAIN_MODEL_ID)

/** Three or more owner-requested tasks, not a preset flow's internal steps. */
export const planModel = wrapLanguageModel({
  model: openAiModel(PLAN_MODEL_ID),
  middleware: taskPlanningGate,
})

/** Simple chat and reads, copywriting, and context compaction. */
export const fastModel = wrapLanguageModel({
  model: openrouter.chat(FAST_MODEL_ID, {
    usage: { include: true },
  }),
  middleware: openRouterUsage,
})

/**
 * Context budgets eve compacts against. The models accept about a million
 * tokens; the main budget is kept lower so long chats compact (and cost)
 * sooner.
 */
export const MAIN_CONTEXT_TOKENS = 200_000
export const FAST_CONTEXT_TOKENS = 1_000_000

/** Decide once per turn through OpenRouter; keep generation providers explicit. */
export const mainChatModel = auto({
  model: openrouter.evaluationModel("typesafe/jev-1.14"),
  fallback: {
    model: mainModel,
    reasoning: "medium",
    modelContextWindowTokens: MAIN_CONTEXT_TOKENS,
  },
  options: {
    [PLAN_MODEL_ID]: {
      model: planModel,
      reasoning: "medium",
      modelContextWindowTokens: MAIN_CONTEXT_TOKENS,
      description: `Use for a request with ${MIN_PLAN_TASKS} or more distinct owner-requested tasks outside preset flows, including read-only questions, and short follow-ups continuing that unfinished multi-task request (approval choices, missing details, or corrections). Count requested outcomes, not preparation, tool calls, approval, or verification. Asking for Google Business hours, the latest website news, and whether the shop offers a product brand is 3 tasks, even though all are read-only. Changing Saturday hours, editing a QDeal, and reordering speakers is also 3 tasks; reading details then proposing and saving one hours change is only 1. A preset flow is already planned: its built-in steps NEVER count, even if it has 3 or more steps. Use Terra for a preset flow without at least 3 separately requested non-flow tasks. Do not select for a single question or requests with only 1-2 non-flow tasks.`,
    },
    [MAIN_MODEL_ID]: {
      model: mainModel,
      reasoning: "medium",
      modelContextWindowTokens: MAIN_CONTEXT_TOKENS,
      description: `Use for preset flows (and their approvals, design reviews, and follow-ups), regardless of how many built-in steps they have. Preset flow triggers: ${flowRouting} Otherwise use for creation, update, deletion, publishing, scheduling, reordering, or memory change involving only 1-2 owner-requested tasks, including short follow-ups that continue them (such as 'yes', a date, or a price). Also use for image interpretation, external research, complex reasoning, or dependent lookups needed for a single task. A request with 3 or more separately requested non-flow tasks belongs to Sol instead. When the task or its context is ambiguous, choose this model.`,
    },
    [FAST_MODEL_ID]: {
      model: fastModel,
      modelContextWindowTokens: MAIN_CONTEXT_TOKENS,
      description:
        "Use only for clearly simple, read-only work: greetings, thanks, explanations or summaries of information already in the conversation, and a bounded lookup or listing in one domain (hours, products, news, deals, Instagram, or Google Business). Loading the domain skill and discovering its read tool is fine. Do not use for 3 or more distinct requested tasks, changes, follow-ups supplying details for unfinished work, image interpretation, research, or complex tool workflows. Read current site data when needed; never rely on memory for it.",
    },
  },
})
