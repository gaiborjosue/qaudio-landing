"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { motion } from "motion/react"
import type { Interaction, UseEveAgentReturn } from "eve/react"
import { SchedulePicker } from "@/components/admin/schedule-picker"
import {
  approvedMessage,
  changesProposal,
  denialNote,
  proposedRelease,
  releaseFields,
  releaseLabel,
  RELEASES,
  releaseTool,
  scheduleBefore,
  scheduledAt,
  withFields,
  type Release,
} from "@/lib/admin/approval-choice"
import { INSTAGRAM_SCHEDULE_DAYS } from "@/lib/admin/instagram"
import type { InstagramPostInput } from "@/lib/admin/schemas"
import { toStoreDateTime } from "@/lib/admin/store-time"
import styles from "./admin.module.css"

type Step = "decide" | "release" | "feedback"

/**
 * A change card's Approve and Deny. Approve saves the change as proposed,
 * except for a news post, deal, or Instagram post, where it first offers how
 * it goes out: now, a draft, or a scheduled time. A choice that matches the
 * proposal approves it; any other goes back to the agent, which proposes it
 * that way and the chat approves that card itself
 * (lib/admin/approval-choice.ts). Deny asks what to change and sends the
 * note with the denial, so the agent can propose again.
 */
export function ApprovalActions({
  agent,
  interaction,
  tool,
  input,
  arrangedPhotos,
  onResetPhotos,
  hint,
}: {
  agent: UseEveAgentReturn
  interaction: Interaction
  tool: string
  input: unknown
  /** A carousel's photos in the order the owner arranged, when changed. */
  arrangedPhotos: InstagramPostInput["photos"] | null
  onResetPhotos: () => void
  hint: string
}) {
  const id = useId()
  const [step, setStep] = useState<Step>("decide")
  const [sending, setSending] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [note, setNote] = useState("")
  const root = useRef<HTMLDivElement>(null)
  /** The button a step opened from, which gets focus back. */
  const opener = useRef<"approve" | "deny" | null>(null)
  const release = releaseTool(tool)
  const busy =
    sending || interaction.answer !== undefined || agent.status === "resuming"

  // Focus follows the step: its first control, or back to what opened it.
  useEffect(() => {
    const element = root.current
    if (!element) return
    if (step === "decide") {
      if (!opener.current) return
      element
        .querySelector<HTMLElement>(`[data-action="${opener.current}"]`)
        ?.focus()
      opener.current = null
    } else {
      element
        .querySelector<HTMLElement>(
          "textarea:not(:disabled), button:not(:disabled)"
        )
        ?.focus()
    }
  }, [step])

  const respond = async (optionId: "approve" | "deny", text?: string) => {
    setSending(true)
    try {
      await agent.respond([
        {
          interactionId: interaction.interactionId,
          optionId,
          ...(text ? { text } : {}),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const open = (next: Step, from: "approve" | "deny") => {
    opener.current = from
    setStep(next)
  }
  const back = () => {
    setScheduling(false)
    setStep("decide")
  }

  // The fields each choice sets, with the carousel's new order if any.
  const now = toStoreDateTime(new Date())
  const fieldsFor = (choice: Release, at: string | null = null) => {
    const fields = release && releaseFields(release, input, choice, at, now)
    if (!fields) return null
    return arrangedPhotos ? { ...fields, photos: arrangedPhotos } : fields
  }
  const choose = async (choice: Release, at: string | null = null) => {
    const fields = fieldsFor(choice, at)
    if (!release || !fields || !withFields(release, input, fields)) return
    if (!changesProposal(release, input, fields)) return respond("approve")
    setSending(true)
    try {
      await agent.send(approvedMessage(release, choice, fields, at))
    } finally {
      setSending(false)
    }
  }
  // Publishing and scheduling need the same things (a news post's cover).
  const publishable = (() => {
    const fields = fieldsFor("now")
    return Boolean(release && fields && withFields(release, input, fields))
  })()
  const leading = release
    ? (proposedRelease(release, input, now) ?? "now")
    : null

  const deny = (event: FormEvent) => {
    event.preventDefault()
    void respond("deny", denialNote(note, arrangedPhotos) || undefined)
  }

  return (
    <div
      ref={root}
      className={styles.approval}
      onKeyDown={(event) => {
        if (event.key === "Escape" && step !== "decide") {
          event.stopPropagation()
          back()
        }
      }}
    >
      {step === "decide" && (
        <>
          <div className={styles.options}>
            <button
              type="button"
              data-action="approve"
              className={styles.primary}
              disabled={busy}
              onClick={() =>
                release ? open("release", "approve") : void respond("approve")
              }
            >
              Approve
            </button>
            <button
              type="button"
              data-action="deny"
              className={styles.secondary}
              disabled={busy}
              onClick={() => open("feedback", "deny")}
            >
              Deny
            </button>
            {arrangedPhotos && (
              <button
                type="button"
                className={styles.quiet}
                disabled={busy}
                onClick={onResetPhotos}
              >
                Reset order
              </button>
            )}
          </div>
          <p className={styles.hint}>{hint}</p>
        </>
      )}

      {step === "release" && release && (
        <motion.div
          className={styles.actions}
          role="group"
          aria-label="Approve as"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          {RELEASES.map((choice) =>
            choice === "schedule" ? (
              <SchedulePicker
                key={choice}
                current={scheduledAt(release, input)}
                before={scheduleBefore(release, input)}
                maxDays={
                  release === "save_instagram_post"
                    ? INSTAGRAM_SCHEDULE_DAYS
                    : undefined
                }
                primary={leading === "schedule"}
                disabled={busy || !publishable}
                onOpenChange={setScheduling}
                onSchedule={(local) => void choose("schedule", local)}
              />
            ) : (
              !scheduling && (
                <button
                  key={choice}
                  type="button"
                  className={
                    leading === choice ? styles.primary : styles.secondary
                  }
                  disabled={busy || (choice === "now" && !publishable)}
                  onClick={() => void choose(choice)}
                >
                  {releaseLabel(release, choice)}
                </button>
              )
            )
          )}
          {!scheduling && (
            <button
              type="button"
              className={styles.quiet}
              disabled={sending}
              onClick={back}
            >
              Back
            </button>
          )}
        </motion.div>
      )}

      {step === "feedback" && (
        <motion.form
          className={styles.feedback}
          onSubmit={deny}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          <label className="visually-hidden" htmlFor={`${id}-note`}>
            What should change?
          </label>
          <textarea
            id={`${id}-note`}
            rows={2}
            value={note}
            placeholder="What should change?"
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
          />
          <div className={styles.options}>
            <button type="submit" className={styles.primary} disabled={busy}>
              {note.trim() ? "Send" : "Deny"}
            </button>
            <button
              type="button"
              className={styles.quiet}
              disabled={sending}
              onClick={back}
            >
              Back
            </button>
          </div>
        </motion.form>
      )}
    </div>
  )
}
