"use client"

import { memo } from "react"
import type { EveToolPart } from "eve/react"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import styles from "./admin.module.css"

const RUNNING = new Set<EveToolPart["state"]>([
  "streaming",
  "requested",
  "running",
  "blocked",
])

// Loading a skill and searching the tool catalog are the agent getting
// ready; their own labels ("Loaded skill products", "Searched tools for
// “products__”") mean little to the owner, so the summary says this instead.
const isPrep = (part: EveToolPart) =>
  part.kind === "skill" || part.name === "eve__search"

function status(part: EveToolPart) {
  if (RUNNING.has(part.state)) return "running" as const
  if (part.state === "failed") return "error" as const
  return undefined
}

const Step = memo(function Step({ part }: { part: EveToolPart }) {
  const state = status(part)
  return (
    <TraceLine status={state} className={styles.step}>
      <TraceTitle>{part.label}</TraceTitle>
      {state === "error" && <TraceDescription>Failed</TraceDescription>}
    </TraceLine>
  )
})

/**
 * A run of the agent's working steps (reads, lookups) between its words and
 * cards, as one collapsed row (shadcn AI Elements' Chain of Thought, on
 * Trace): it names the step under way, or the last real one, and expands
 * into the whole trail.
 */
export const Steps = memo(
  function Steps({ parts }: { parts: EveToolPart[] }) {
    const active = parts.findLast((part) => RUNNING.has(part.state))
    const lead = active ?? parts.findLast((part) => !isPrep(part))
    const running = active !== undefined
    const title =
      lead && !isPrep(lead)
        ? lead.label
        : running
          ? "Checking the details"
          : "Checked the details"
    const summary = (
      <TraceLine
        status={running ? "running" : lead && status(lead)}
        className={styles.step}
      >
        <TraceTitle>{title}</TraceTitle>
        {parts.length > 1 && (
          <TraceDescription>{parts.length} steps</TraceDescription>
        )}
      </TraceLine>
    )

    if (parts.length === 1 && !isPrep(parts[0])) {
      return (
        <Trace>
          <Step part={parts[0]} />
        </Trace>
      )
    }

    return (
      <Trace>
        <TraceCollapsible>
          <TraceCollapsibleTrigger className={styles.stepsTrigger}>
            {summary}
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent className={styles.stepsTrail}>
            <Trace>
              {parts.map((part) => (
                <Step key={part.callId} part={part} />
              ))}
            </Trace>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
    )
  },
  (a, b) =>
    a.parts.length === b.parts.length &&
    a.parts.every((part, index) => part === b.parts[index])
)
