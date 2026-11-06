"use client"

import { memo, useSyncExternalStore } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, Minus, Workflow } from "lucide-react"
import type { FlowStepStatus, FlowView } from "@/lib/admin/flows"
import styles from "./admin.module.css"

const SPRING = { type: "spring" as const, stiffness: 420, damping: 32 }
const EASE = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }

const SPOKEN: Record<FlowStepStatus, string> = {
  pending: "to do",
  active: "in progress",
  waiting: "waiting for your approval",
  done: "done",
  skipped: "skipped",
}

/**
 * Wide enough for the steps to stand in the empty space left of the chat
 * column, as a vertical rail; narrower, they're a strip above the thread.
 * The same width as the rail's media query in admin.module.css: CSS lays
 * it out, and this only picks the entrance and the connectors' axis.
 */
const RAIL_QUERY = "(min-width: 1400px)"

function subscribeRail(notify: () => void) {
  const query = window.matchMedia(RAIL_QUERY)
  query.addEventListener("change", notify)
  return () => query.removeEventListener("change", notify)
}

const useRail = () =>
  useSyncExternalStore(
    subscribeRail,
    () => window.matchMedia(RAIL_QUERY).matches,
    () => false
  )

/** A run as text: the stepper redraws only when this changes. */
const runKey = (run: FlowView | null) =>
  run &&
  `${run.flow.id}:${run.status}:${run.steps.map((step) => step.status).join(",")}`

/**
 * The flow under way, after React Bits' Stepper (a gliding fill between
 * numbered dots and spring transitions), in the chat's monochrome. On wide
 * screens it's a vertical rail in the space left of the conversation, kept
 * clear of it; otherwise a strip above the thread. It follows the run by
 * itself (lib/admin/flows.ts flowState) and collapses away as soon as the
 * final step succeeds. Reduced motion dismisses it immediately.
 * It's read again on every update, so it skips redrawing while nothing
 * changed.
 */
export const FlowStepper = memo(
  function FlowStepper({ run }: { run: FlowView | null }) {
    const rail = useRail()
    const still = useReducedMotion()
    const current = run?.steps.findIndex((step) =>
      ["active", "waiting"].includes(step.status)
    )
    // The rail slides in from the side it lives on; the strip opens down.
    const hidden = rail ? { opacity: 0, x: -10 } : { opacity: 0, height: 0 }
    return (
      <div className={styles.flowBar}>
        <AnimatePresence initial={false}>
          {run?.status === "active" && (
            <motion.section
              key={run.flow.id}
              className={styles.flow}
              aria-label={`${run.flow.name} flow`}
              initial={hidden}
              animate={{ opacity: 1, x: 0, height: "auto" }}
              exit={{ ...hidden, height: 0 }}
              transition={still ? { duration: 0 } : EASE}
            >
              <div className={styles.flowInner}>
                <p className={styles.flowHeading}>
                  <span className={styles.flowIcon} aria-hidden="true">
                    <Workflow size={16} strokeWidth={1.8} />
                  </span>
                  <span className={styles.flowTitle}>{run.flow.name}</span>
                  <span className={styles.flowProgress} role="status">
                    {current !== undefined && current >= 0
                      ? `Step ${current + 1} of ${run.steps.length}`
                      : ""}
                  </span>
                </p>
                <ol className={styles.flowSteps}>
                  {run.steps.map((step, index) => {
                    const lit =
                      step.status === "done" || step.status === "skipped"
                    const live =
                      step.status === "active" || step.status === "waiting"
                    return (
                      <li
                        key={step.id}
                        data-status={step.status}
                        aria-current={live ? "step" : undefined}
                      >
                        <span className={styles.flowMarker}>
                          {/* Keep the continuous CSS waves outside the dot's
                              spring transform. They persist between active
                              and waiting, with no JS work per frame. */}
                          {live && (
                            <span
                              className={styles.flowPulse}
                              aria-hidden="true"
                            >
                              <span />
                              <span />
                            </span>
                          )}
                          <motion.span
                            className={styles.flowDot}
                            initial={false}
                            animate={{ scale: live ? 1 : 0.86 }}
                            transition={SPRING}
                          >
                            <AnimatePresence mode="wait" initial={false}>
                              <motion.span
                                key={lit ? step.status : "number"}
                                className={styles.flowDotFace}
                                initial={{ opacity: 0, scale: 0.6 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.6 }}
                                transition={{ duration: 0.16 }}
                              >
                                {step.status === "done" ? (
                                  <Check
                                    size={13}
                                    strokeWidth={2.5}
                                    aria-hidden="true"
                                  />
                                ) : step.status === "skipped" ? (
                                  <Minus
                                    size={13}
                                    strokeWidth={2.5}
                                    aria-hidden="true"
                                  />
                                ) : (
                                  index + 1
                                )}
                              </motion.span>
                            </AnimatePresence>
                          </motion.span>
                        </span>
                        <span className={styles.flowLabel}>
                          {step.label}
                          <span className="visually-hidden">
                            , {SPOKEN[step.status]}
                          </span>
                        </span>
                        {index < run.steps.length - 1 && (
                          <span className={styles.flowLine} aria-hidden="true">
                            {/* Fills toward the next step: down the rail,
                                across the strip. */}
                            <motion.span
                              initial={false}
                              animate={
                                rail
                                  ? { scaleX: 1, scaleY: lit ? 1 : 0 }
                                  : { scaleX: lit ? 1 : 0, scaleY: 1 }
                              }
                              transition={SPRING}
                            />
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    )
  },
  (a, b) => runKey(a.run) === runKey(b.run)
)
