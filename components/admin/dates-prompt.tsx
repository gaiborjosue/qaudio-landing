"use client"

import { useState } from "react"
import type { DateRange } from "react-day-picker"
import type { Interaction } from "eve/react"
import type { ChatActions } from "@/components/admin/chat-actions"
import { Calendar } from "@/components/ui/calendar"
import {
  formatStoreDateTime,
  STORE_DATETIME,
  toStoreDateTime,
} from "@/lib/admin/store-time"
import styles from "./admin.module.css"

const pad = (value: number) => String(value).padStart(2, "0")
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// The calendar works in the browser's local dates; a picked day is read as a
// store date (America/New_York), like every time the agent handles.
const toDay = (date: string) => {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(year, month - 1, day)
}
const fromDay = (day: Date) =>
  `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`

/**
 * ask_dates' question: a range on the calendar, starting now when it starts
 * today, otherwise at a time, and ending at a time (the day's end unless
 * changed). The answer goes back as "<start>/<end>" in store time, which
 * the tool reads as dates (agent/lib/ask-dates.ts); typing an answer in the
 * message field works too.
 */
export function DatesPrompt({
  interaction,
  input,
  actions,
}: {
  interaction: Interaction
  input: unknown
  actions: ChatActions
}) {
  const suggested = (input ?? {}) as { starts_at?: unknown; ends_at?: unknown }
  const start =
    typeof suggested.starts_at === "string" &&
    STORE_DATETIME.test(suggested.starts_at)
      ? suggested.starts_at
      : null
  const end =
    typeof suggested.ends_at === "string" &&
    STORE_DATETIME.test(suggested.ends_at)
      ? suggested.ends_at
      : null
  const now = toStoreDateTime(new Date())
  const today = toDay(now.slice(0, 10))
  const [range, setRange] = useState<DateRange | undefined>(() => ({
    from: start && start > now ? toDay(start.slice(0, 10)) : today,
    to: end ? toDay(end.slice(0, 10)) : undefined,
  }))
  const [startTime, setStartTime] = useState(start ? start.slice(11) : "00:00")
  const [endTime, setEndTime] = useState(end ? end.slice(11) : "23:59")
  const [sending, setSending] = useState(false)

  const first = range?.from ? fromDay(range.from) : null
  const last = range?.to ? fromDay(range.to) : first
  const startsNow = first !== null && first <= now.slice(0, 10)
  const from = startsNow ? "now" : first && `${first}T${startTime}`
  const until = last && `${last}T${endTime}`
  const valid =
    from !== null &&
    until !== null &&
    TIME.test(endTime) &&
    (startsNow || TIME.test(startTime)) &&
    until > now &&
    (from === "now" || from < until)
  const busy = sending || interaction.answer !== undefined || actions.resuming

  const answer = async () => {
    if (!valid) return
    setSending(true)
    try {
      await actions.respond([
        { interactionId: interaction.interactionId, text: `${from}/${until}` },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <section
      className={`${styles.card} ${styles.question} ${styles.datesCard}`}
    >
      {interaction.request.title && (
        <h2 className={styles.promptTitle}>{interaction.request.title}</h2>
      )}
      <p>{interaction.request.prompt}</p>
      <div className={styles.dates}>
        <Calendar
          mode="range"
          selected={range}
          onSelect={setRange}
          defaultMonth={range?.from ?? today}
          disabled={{ before: today }}
          className={styles.calendar}
        />
        <div className={styles.dateTimes}>
          {startsNow ? (
            <p className={styles.hint}>Starts now</p>
          ) : (
            <label className={styles.timeField}>
              Starts <span>(store time)</span>
              <input
                type="time"
                step={300}
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </label>
          )}
          <label className={styles.timeField}>
            Ends <span>(store time)</span>
            <input
              type="time"
              step={60}
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </label>
        </div>
        <div className={styles.options}>
          <button
            type="button"
            className={styles.primary}
            disabled={!valid || busy}
            onClick={() => void answer()}
          >
            {valid
              ? `${from === "now" ? "Now" : formatStoreDateTime(from!)} until ${formatStoreDateTime(until!)}`
              : "Pick the dates"}
          </button>
        </div>
      </div>
      <p className={styles.hint}>Or type the dates below.</p>
    </section>
  )
}
