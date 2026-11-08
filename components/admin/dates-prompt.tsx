"use client"

import { useState } from "react"
import type { DateRange } from "react-day-picker"
import type { Interaction } from "eve/react"
import type { ChatActions } from "@/components/admin/chat-actions"
import { RangeCalendar } from "./range-calendar"
import {
  formatStoreDateTime,
  STORE_DATETIME,
  toStoreDateTime,
} from "@/lib/admin/store-time"
import styles from "./admin.module.css"
import { Clock } from "./clock"

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
 * ask_dates' question: a range the owner picks on the calendar (nothing
 * picked at first), starting now when it starts today, otherwise at a time,
 * and ending at a time (the day's end unless changed). The answer goes back
 * as "<start>/<end>" in store time, which the tool reads as dates
 * (agent/lib/ask-dates.ts); typing an answer in the message field works too.
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
  // Nothing is picked until the owner starts the range; a suggestion only
  // sets the times and the month shown.
  const [range, setRange] = useState<DateRange | undefined>()
  const suggestedMonth =
    start && start > now
      ? toDay(start.slice(0, 10))
      : end && end > now
        ? toDay(end.slice(0, 10))
        : today
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
        <RangeCalendar
          selected={range}
          onSelect={setRange}
          defaultMonth={suggestedMonth}
          disabled={{ before: today }}
          className={styles.calendar}
        />
        <div className={styles.dateTimes}>
          {startsNow ? (
            <p className={styles.hint}>Starts now</p>
          ) : (
            <div className={styles.timeField}>
              Starts <span>(store time)</span>
              <Clock label="Starts" value={startTime} onChange={setStartTime} />
            </div>
          )}
          <div className={styles.timeField}>
            Ends <span>(store time)</span>
            <Clock label="Ends" value={endTime} onChange={setEndTime} />
          </div>
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
