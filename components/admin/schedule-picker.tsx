"use client"

import { useEffect, useId, useRef, useState } from "react"
import { CalendarClock, X } from "lucide-react"
import { motion } from "motion/react"
import { Calendar } from "@/components/ui/calendar"
import {
  formatStoreDateTime,
  STORE_DATETIME,
  toStoreDateTime,
} from "@/lib/admin/store-time"
import styles from "./admin.module.css"

const pad = (value: number) => String(value).padStart(2, "0")

// The calendar works in the browser's local dates; the picked day is read as
// a store date (America/New_York), like every time the agent handles.
const toDay = (date: string) => {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(year, month - 1, day)
}
const fromDay = (day: Date) =>
  `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`

/**
 * "Schedule" in a news post, deal, or Instagram post's Approve step
 * (approval-actions.tsx): the button morphs into a calendar with one go-live
 * time, and choosing approves the proposal for that time. `maxDays` limits
 * how far ahead (Instagram: a week); `before` is a time it must come before
 * (a deal's end).
 */
export function SchedulePicker({
  current,
  disabled,
  maxDays,
  before,
  primary = false,
  onOpenChange,
  onSchedule,
}: {
  /** The proposal's store-time go-live time, when it has one. */
  current: string | null
  disabled: boolean
  maxDays?: number
  before?: string | null
  /** The proposal is already scheduled, so this is the leading choice. */
  primary?: boolean
  onOpenChange?: (open: boolean) => void
  onSchedule: (local: string) => void
}) {
  const id = useId()
  const [open, setOpenState] = useState(false)
  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
  }
  const clock = new Date()
  const now = toStoreDateTime(clock)
  const latest = maxDays
    ? toStoreDateTime(new Date(clock.getTime() + maxDays * 24 * 60 * 60 * 1000))
    : null
  const end = before && STORE_DATETIME.test(before) ? before : null
  const preset =
    current &&
    STORE_DATETIME.test(current) &&
    current > now &&
    (!latest || current <= latest) &&
    (!end || current < end)
  const [day, setDay] = useState<Date | undefined>(
    preset ? toDay(current.slice(0, 10)) : undefined
  )
  const [time, setTime] = useState(preset ? current.slice(11) : "09:00")
  const trigger = useRef<HTMLButtonElement>(null)
  const reopened = useRef(false)

  // Focus follows the morph: the calendar takes it on open (autoFocus), and
  // the button gets it back on close.
  useEffect(() => {
    if (open) reopened.current = true
    else if (reopened.current) trigger.current?.focus()
  }, [open])

  const local = day ? `${fromDay(day)}T${time}` : null
  const future = local !== null && STORE_DATETIME.test(local) && local > now
  const beforeEnd = local !== null && (!end || local < end)
  const inRange = future && beforeEnd && (!latest || local <= latest)
  const today = toDay(now.slice(0, 10))
  const last = [latest, end]
    .flatMap((limit) => (limit ? [limit.slice(0, 10)] : []))
    .sort()[0]
  const lastDay = last ? toDay(last) : null

  if (!open) {
    return (
      <motion.button
        ref={trigger}
        layoutId={`schedule-${id}`}
        type="button"
        className={primary ? styles.primary : styles.secondary}
        style={{ borderRadius: 999 }}
        disabled={disabled}
        aria-expanded={false}
        onClick={() => setOpen(true)}
      >
        <CalendarClock size={15} strokeWidth={1.6} aria-hidden="true" />
        Schedule
      </motion.button>
    )
  }

  return (
    <motion.div
      layoutId={`schedule-${id}`}
      className={styles.morphPanel}
      style={{ borderRadius: 18 }}
      role="group"
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <motion.div
        className={styles.morphBody}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.12 } }}
      >
        <div className={styles.morphHeader}>
          <h3 id={`${id}-title`}>Go live</h3>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Close schedule"
            onClick={() => setOpen(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <Calendar
          mode="single"
          selected={day}
          onSelect={setDay}
          defaultMonth={day ?? today}
          disabled={
            lastDay
              ? [{ before: today }, { after: lastDay }]
              : { before: today }
          }
          className={styles.calendar}
          autoFocus
        />
        <label className={styles.timeField}>
          Time <span>(store time)</span>
          <input
            type="time"
            step={300}
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </label>
        <div className={styles.options}>
          <button
            type="button"
            className={styles.primary}
            disabled={!inRange || disabled}
            onClick={() => {
              if (!local || !inRange) return
              onSchedule(local)
              setOpen(false)
            }}
          >
            {inRange
              ? `Schedule for ${formatStoreDateTime(local)}`
              : !future
                ? "Pick a future time"
                : !beforeEnd && end
                  ? `Pick a time before ${formatStoreDateTime(end)}`
                  : `Pick a time within ${maxDays} days`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
