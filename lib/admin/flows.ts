import { z } from "zod"
import { previewToolName } from "./tool-names"

// Flows: the owner's preset sequences of changes, which Tune runs when a
// request matches one that's on. Each step is an ordinary tool call (most
// are approval cards), so a flow never saves anything the owner didn't
// approve. The admin chat's Flows pill turns each one on or off (on by
// default) and sends the choice with every message; the eve channel tells
// the model which are on and when each applies, and puts the list on the
// caller (FLOW_ATTRIBUTE) for flow_progress to check. The chat's stepper
// reads a run's progress back from the conversation (flowState).
// Relative imports, because the agent imports this too.

export type FlowStep = {
  id: string
  /** On the stepper. */
  label: string
  /** The tool call that is this step: its canonical name. */
  tool?: string
  /** What Tune does in this step, returned by flow_progress. */
  instructions: string
}

export type Flow = {
  id: string
  name: string
  /** One line in the Flows menu. */
  summary: string
  /** When Tune starts it; told to the model each turn while it's on. */
  trigger: string
  steps: readonly FlowStep[]
}

export const FLOWS = [
  {
    id: "product-sale",
    name: "Product sale",
    summary:
      "News post, sale prices, a Sales page feature, then a designed Instagram story",
    trigger:
      "the owner tells you about a sale, discount, or promotion on shop products or a brand (often with its promotion graphic), whatever they ask for about it: a news post, an Instagram post or story, new prices, or all of it",
    steps: [
      {
        id: "products",
        label: "Products",
        instructions:
          "Look at the attached promotion graphic with view_photos. Load the products skill and discover products__. Work out the brand and product line from the owner's words and the graphic, then find the matching products with products__list_catalog (brand_slug, and search with the line's name). For a storefront promotion, match published, available products. Say in one short list which products match. Ask with ask_question only when it's unclear which ones. If none are in the shop, say so: the prices step is then skipped.",
      },
      {
        id: "dates",
        label: "Dates",
        tool: "ask_dates",
        instructions:
          "If the owner gave when the sale starts and ends, or the graphic shows it, use that and say it back in a few words; otherwise call ask_dates once, which shows the owner a calendar. An end date means the end of that day (T23:59), and a sale with no start begins now.",
      },
      {
        id: "news",
        label: "News post",
        tool: "news__save_news_post",
        instructions:
          "Load the news skill and discover news__. Write the post from the graphic and the owner's words: what's on sale, how much off, and until when, linking each product to /products/<slug>. Use the attached graphic as the cover, fit contain. Propose it with news__save_news_post, published at the sale's start (\"now\" when it starts now), with expires_at set to the promotion's end. Keep the saved result's id, status, and published_at for the price step.",
      },
      {
        id: "prices",
        label: "Sale prices",
        tool: "products__save_sale",
        instructions:
          "Call products__save_sale with the matched products exactly as products__list_catalog gave them (id, name, price_cents, msrp_cents), the discount, and the dates. If the news step saved a post, pass its returned id as news_post_id. If that post is published or scheduled, use its returned published_at as starts_at even if the approval changed the proposed time. If it was saved as a draft or skipped, keep the confirmed sale dates. Never guess a post id. Use off msrp when the promotion is off MSRP or list price, otherwise price. Mark this step skipped when no products matched.",
      },
      {
        id: "feature",
        label: "Sales feature",
        tool: "deals__save_deal",
        instructions:
          "Load the deals skill and discover deals__. Propose a new featured sale for the Sales page with deals__save_deal: kind sale and no id, so it's added beside any featured sales already there, never replacing or changing them. Use the promotion graphic as its image (its path, width, and height, with alt text from what it shows); a title in a few words, such as \"Monitor Audio Bronze: up to 20% off\"; a one-line summary of what's included; note \"\" and items []. Make it published, with starts_at the sale's start (null when it started now) and ends_at the sale's end, so it shows and ends with the sale. The owner approves it, asks for changes, or chooses Don't feature: a denial whose note starts with \"Skip step:\" means don't feature it. Then call flow_progress with this step skipped and go on to the next step without asking.",
      },
      {
        id: "design",
        label: "Story design",
        tool: "design_story",
        instructions:
          "Design the sale's Instagram story with design_story (always a story, never a feed post, in this flow). The brief: a short headline and the offer (how much off, on which line or products) and until when, in the owner's words and the graphic's, exact and few; the look follows the graphic. Photos: the promotion graphic, or the saved news post's cover, and up to 3 of the matched products' photos (products__get_product). The tool pauses on the design for Continue or edit feedback. Stay on this step until review is continued. For changes_requested call edit_story on the returned design with that feedback (copy any Story edit payload exactly); it pauses again. For interrupted stop. Only after Continue move to the Instagram step; Continue never approves posting.",
      },
      {
        id: "instagram",
        label: "Instagram story",
        tool: "instagram__save_post",
        instructions:
          'After the design review returns continued, load the instagram skill and discover instagram__. Propose the design as a story with instagram__save_post: kind story, the returned design\'s path, width, and height as its one photo (the owner may continue with an earlier version; use the returned design), fit cover, alt text from what it shows, no caption. Its when matches the news post: "now" if it went live now, its time if that\'s within 7 days, otherwise "draft". If the owner requests changes to the design, use edit_story (FLUX Klein) with the current design and that feedback, copying any Story edit regions exactly, wait for its Continue, then propose the design it returns for fresh approval. Never call design_story for revisions or restart this flow for feedback.',
      },
    ],
  },
  {
    id: "news-instagram",
    name: "News to Instagram",
    summary: "Every new news post gets an Instagram post too",
    trigger:
      "the owner asks for a new news post that isn't about a sale, discount, or promotion (those are product-sale), and isn't a step of another flow",
    steps: [
      {
        id: "news",
        label: "News post",
        tool: "news__save_news_post",
        instructions:
          "First check: if this news is about a sale, discount, or promotion on products or a brand (in the owner's words or an attached graphic), this flow doesn't apply. Call flow_progress with status stopped, then start product-sale if it's on, or else do only what the owner asked. Otherwise write the news post the owner asked for, as the news skill says, and propose it with news__save_news_post.",
      },
      {
        id: "instagram",
        label: "Instagram",
        tool: "instagram__save_post",
        instructions:
          'Once the news post is saved, load the instagram skill and discover instagram__. Make a feed post from it (not a story, and no designed image): its cover (with its body photos for a carousel), and a caption from its title and opening that points to qaudio.com/news/<slug>. Propose it with instagram__save_post, its when matching how the news post was saved: "now" if it went live, its time if it\'s scheduled within 7 days, otherwise "draft".',
      },
    ],
  },
] as const satisfies readonly Flow[]

export type FlowId = (typeof FLOWS)[number]["id"]
export const FLOW_IDS = FLOWS.map((flow) => flow.id) as [FlowId, ...FlowId[]]
/** The caller attribute listing the flows that are on. */
export const FLOW_ATTRIBUTE = "flows"
/** The direct tool that starts a flow and moves it along. */
export const FLOW_TOOL = "flow_progress"

export const flowById = (id: string): Flow | undefined =>
  FLOWS.find((flow) => flow.id === id)

/** Which flows are on, by id; every one is on unless turned off. */
export type FlowSettings = Record<FlowId, boolean>

export const DEFAULT_FLOW_SETTINGS = Object.fromEntries(
  FLOW_IDS.map((id) => [id, true])
) as FlowSettings

/** Saved settings, with anything unknown or missing at its default. */
export function parseFlowSettings(value: unknown): FlowSettings {
  const saved = value && typeof value === "object" ? value : {}
  return Object.fromEntries(
    FLOW_IDS.map((id) => {
      const on = (saved as Record<string, unknown>)[id]
      return [id, typeof on === "boolean" ? on : true]
    })
  ) as FlowSettings
}

export const enabledFlows = (settings: FlowSettings) =>
  FLOW_IDS.filter((id) => settings[id])

/**
 * The flows on, from what the chat sent with a message (`{ flows: [...] }`),
 * or null when it sent nothing (every flow is then on).
 */
export function flowsFromClient(value: unknown): FlowId[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const list = (value as { flows?: unknown }).flows
  if (!Array.isArray(list)) return null
  return FLOW_IDS.filter((id) => list.includes(id))
}

/** The flows on, from the caller's attributes; all when it has none. */
export function flowsFromAttributes(
  attributes: Readonly<Record<string, string | readonly string[]>> | undefined
): FlowId[] {
  const value = attributes?.[FLOW_ATTRIBUTE]
  if (value === undefined) return [...FLOW_IDS]
  const list = typeof value === "string" ? [value] : value
  return FLOW_IDS.filter((id) => list.includes(id))
}

/** What the model reads each turn about the flows. */
export function flowContext(on: readonly FlowId[]) {
  if (on.length === 0) {
    return "Flows: all off. Do only what the owner asks."
  }
  const lines = FLOWS.filter((flow) => on.includes(flow.id)).map(
    (flow) => `- ${flow.id} (${flow.name}): when ${flow.trigger}.`
  )
  const off = FLOWS.filter((flow) => !on.includes(flow.id)).map(
    (flow) => flow.id
  )
  return [
    `Flows on (start one with ${FLOW_TOOL}({ flow }) when a request matches it; when more than one could, the first listed wins):`,
    ...lines,
    off.length > 0
      ? `Flows off: ${off.join(", ")}. Do only what the owner asks for those.`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
}

// Words that mark a message as being about a sale. "Deal" alone isn't one:
// QDeal promotions have their own skill.
const SALE_WORDS =
  /\b(?:on sale|sales?|discount(?:s|ed)?|percent off|promo(?:tion)?s?|markdowns?|clearance|price (?:drops?|cuts?)|special offers?|black friday|cyber monday|off (?:msrp|list))\b|\b\d{1,2}(?:\.\d)?\s?%/i
// The lines the chat adds for the agent (photos, the item, a card's
// choice), which can mention a sale without the owner asking about one.
const AGENT_LINE =
  /^(?:Photo uploaded|Item|Order|Order saved|Photo order|Approved photo order|Approved as|Skip step): .*$/gm

/**
 * A nudge for a message that mentions a sale, so a news post about one goes
 * to the product-sale flow (a news post, sale prices, a designed story)
 * rather than news-instagram, which is for news that isn't about a sale.
 * Null when the owner's words don't mention one, or no flow it'd change is
 * on.
 */
export function flowHint(text: string, on: readonly FlowId[]) {
  if (!SALE_WORDS.test(text.replace(AGENT_LINE, ""))) return null
  if (on.includes("product-sale")) {
    return "This message mentions a sale, discount, or promotion. Unless a flow is already under way for it, anything the owner asks about it (a news post, an Instagram post or story, prices) starts the product-sale flow, not news-instagram."
  }
  if (on.includes("news-instagram")) {
    return "This message mentions a sale, discount, or promotion: news-instagram is only for news that isn't about a sale, so don't start it; do only what the owner asks."
  }
  return null
}

export const flowProgressSchema = z
  .object({
    flow: z.enum(FLOW_IDS),
    step: z
      .string()
      .max(40)
      .optional()
      .describe(
        "The step starting now, or the one skipped. Omit to start the flow at its first step, and for done or stopped."
      ),
    status: z
      .enum(["active", "skipped", "done", "stopped"])
      .default("active")
      .describe(
        "active: this step starts now. skipped: this step isn't needed. done: the flow is complete. stopped: the owner stopped it."
      ),
  })
  .superRefine((input, ctx) => {
    const flow = flowById(input.flow)
    if (input.step && !flow?.steps.some((step) => step.id === input.step)) {
      ctx.addIssue({
        code: "custom",
        message: `${input.flow} has the steps ${flow?.steps
          .map((step) => step.id)
          .join(", ")}.`,
      })
    }
    if (input.status === "skipped" && !input.step) {
      ctx.addIssue({ code: "custom", message: "Name the step to skip." })
    }
  })

export type FlowProgressInput = z.infer<typeof flowProgressSchema>

export type FlowStepStatus =
  "pending" | "active" | "waiting" | "done" | "skipped"

export type FlowView = {
  flow: Flow
  status: "active" | "done"
  steps: { id: string; label: string; status: FlowStepStatus }[]
}

type Message = { readonly role: string; readonly parts: readonly unknown[] }
type Run = {
  flow: Flow
  current: number
  status: "active" | "done" | "stopped"
  skipped: Set<string>
  /** Each tool step's latest call state. */
  states: Map<string, string>
  /** The owner wrote after the run ended, so it's put away. */
  dismissed: boolean
}

// A card waits on the owner in these states; a call that failed or was
// declined leaves its step where it was, for the next proposal.
const WAITING = new Set([
  "approval",
  "streaming",
  "requested",
  "running",
  "blocked",
])

/** flow_progress inputs, parsed once each: the chat reads the conversation
 * again on every streamed update. */
const progressInputs = new WeakMap<object, FlowProgressInput | null>()

function progressInput(value: unknown) {
  if (!value || typeof value !== "object") return null
  let input = progressInputs.get(value)
  if (input === undefined) {
    input = flowProgressSchema.safeParse(value).data ?? null
    progressInputs.set(value, input)
  }
  return input
}

/**
 * The latest flow run in the conversation, or null
 * when there's none to show (none started, stopped, or finished before the
 * owner's latest message). Completed metadata remains available; the stepper
 * displays only active runs. Steps follow flow_progress calls, and also the
 * step tools' own calls, so the stepper keeps up even when the model skips
 * a progress call. Pure; tested in scripts/flows.test.mjs.
 */
export function flowState(messages: readonly Message[]): FlowView | null {
  let run: Run | null = null
  for (const message of messages) {
    if (message.role === "user") {
      if (run && run.status !== "active") run.dismissed = true
      continue
    }
    for (const item of message.parts) {
      if (!item || typeof item !== "object") continue
      const part = item as Record<string, unknown>
      if (part.type !== "tool" || typeof part.name !== "string") continue
      const state = typeof part.state === "string" ? part.state : ""
      if (part.name === FLOW_TOOL) {
        if (["failed", "rejected", "cancelled"].includes(state)) continue
        const parsed = progressInput(part.input)
        if (!parsed) continue
        const { flow: id, step, status } = parsed
        const flow = flowById(id)!
        if (!run || run.flow.id !== id || run.status !== "active") {
          if (status !== "active") continue
          run = {
            flow,
            current: 0,
            status: "active",
            skipped: new Set(),
            states: new Map(),
            dismissed: false,
          }
        }
        if (status === "done" || status === "stopped") {
          run.status = status
          continue
        }
        const index = step
          ? flow.steps.findIndex((item) => item.id === step)
          : 0
        if (status === "skipped") run.skipped.add(step!)
        else run.current = Math.max(run.current, index)
        continue
      }
      if (!run || run.status !== "active") continue
      const name = part.name
      // Tool names as the conversation has them: canonical, or the
      // original names older calls carry.
      const index = run.flow.steps.findIndex((step: FlowStep) => {
        if (!step.tool) return false
        if (
          step.tool === name ||
          (step.tool === "design_story" && name === "edit_story")
        )
          return true
        const kind = previewToolName(step.tool)
        return kind !== undefined && kind === previewToolName(name)
      })
      if (index < 0) continue
      const step = run.flow.steps[index]
      if (name === "edit_story") {
        run.current = index
        for (const later of run.flow.steps.slice(index + 1))
          run.states.delete(later.id)
      } else run.current = Math.max(run.current, index)
      run.states.set(step.id, state)
      if (state === "completed" && index === run.flow.steps.length - 1) {
        run.status = "done"
      }
    }
  }
  if (!run || run.status === "stopped" || run.dismissed) return null
  const finished = run.status === "done"
  const current = run.current
  const states = run.states
  const skipped = run.skipped
  return {
    flow: run.flow,
    status: finished ? "done" : "active",
    steps: run.flow.steps.map((step, index) => {
      const state = states.get(step.id)
      const status: FlowStepStatus = skipped.has(step.id)
        ? "skipped"
        : finished || index < current || state === "completed"
          ? "done"
          : index === current
            ? state && WAITING.has(state)
              ? "waiting"
              : "active"
            : "pending"
      return { id: step.id, label: step.label, status }
    }),
  }
}
