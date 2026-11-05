import type { WorkflowToolContext } from "eve/tools"

// The ask_dates tool's workflow body (agent/tools/ask_dates.ts). It asks the
// owner once and turns the answer into dates. The admin chat answers with a
// date-range calendar, sending "<start>/<end>" in store time, where start is
// "now" or "YYYY-MM-DDTHH:MM"; anything typed instead goes back as written.
// No imports but types: a workflow body replays, so it stays deterministic.

export type AskDatesInput = {
  question: string
  starts_at?: string
  ends_at?: string
}

export type AskDatesOutput =
  | { status: "answered"; starts_at: string; ends_at: string }
  | { status: "answered"; answer: string }
  | { interrupted: true }
  | { status: "unavailable" }

const RANGE =
  /^(now|\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d)\/(\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d)$/

/** The answer as dates, or as the owner typed it. */
export function datesFromAnswer(answer: {
  status: string
  optionId?: string
  text?: string
}): AskDatesOutput {
  if (answer.status === "cancelled") return { interrupted: true }
  if (answer.status !== "answered") return { status: "unavailable" }
  const text = (answer.text ?? answer.optionId ?? "").trim()
  const match = text.match(RANGE)
  if (match && (match[1] === "now" || match[1] < match[2])) {
    return { status: "answered", starts_at: match[1], ends_at: match[2] }
  }
  return { status: "answered", answer: text }
}

export async function askDates(
  input: AskDatesInput,
  ctx: WorkflowToolContext
): Promise<AskDatesOutput> {
  "use workflow"
  const answer = await ctx.ask({
    title: "Dates",
    prompt: input.question,
    display: "text",
    allowFreeform: true,
  })
  return datesFromAnswer(answer)
}
