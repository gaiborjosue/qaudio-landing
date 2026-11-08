"use client"

import { useRef } from "react"
import {
  DateRangePicker,
  type DateRangePreset,
} from "@/components/arc/date-range-picker/date-range-picker"
import { calendarDay, saleDatesFromRange } from "@/lib/admin/sale-dates"
import { toStoreDateTime } from "@/lib/admin/store-time"
import { Choice } from "./choice"
import styles from "./sale-date-range.module.css"

const options = (count: number) =>
  Array.from({ length: count }, (_, value) => {
    const text = String(value).padStart(2, "0")
    return { value: text, label: text }
  })
const HOURS = options(24)
const MINUTES = options(60)

const after = (day: Date, days: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate() + days)

// Sales run forward from today, so the shortcuts look ahead.
const PRESETS: DateRangePreset[] = [
  { label: "Today", range: (today) => ({ start: today, end: today }) },
  {
    label: "7 days",
    range: (today) => ({ start: today, end: after(today, 6) }),
  },
  {
    label: "14 days",
    range: (today) => ({ start: today, end: after(today, 13) }),
  },
  {
    label: "30 days",
    range: (today) => ({ start: today, end: after(today, 29) }),
  },
  {
    label: "Rest of month",
    range: (today) => ({
      start: today,
      end: new Date(today.getFullYear(), today.getMonth() + 1, 0),
    }),
  },
]

function Clock({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [hour, minute] = value.split(":")
  return (
    <div className={styles.clock}>
      <Choice
        value={hour}
        options={HOURS}
        disabled={disabled}
        aria-label={`${label} hour`}
        onChange={(next) => onChange(`${next}:${minute}`)}
      />
      <span aria-hidden="true">:</span>
      <Choice
        value={minute}
        options={MINUTES}
        disabled={disabled}
        aria-label={`${label} minute`}
        onChange={(next) => onChange(`${hour}:${next}`)}
      />
    </div>
  )
}

/**
 * The sale's days on the Arc date range picker, then its store-time start
 * (or Now) and end. Days show only once an end is picked; an empty start
 * means "now", so the range starts today.
 */
export function SaleDateRange({
  start,
  end,
  onChange,
  disabled = false,
  id,
}: {
  start: string
  end: string
  onChange: (dates: { start: string; end: string }) => void
  disabled?: boolean
  id: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const now = toStoreDateTime(new Date())
  const today = now.slice(0, 10)
  const value = end
    ? { start: calendarDay(start || today), end: calendarDay(end) }
    : null
  return (
    <div ref={root} className={styles.range}>
      <DateRangePicker
        id={id}
        className={styles.picker}
        label="Sale dates"
        placeholder="Pick the dates"
        value={value}
        presets={PRESETS}
        minDate={calendarDay(today)}
        months={1}
        disabled={disabled}
        // Keep the panel inside the product sheet, not just the window.
        boundary={() => root.current?.closest("form") ?? null}
        onChange={(range) =>
          onChange(
            saleDatesFromRange(
              { from: range.start, to: range.end },
              start,
              end,
              today
            )
          )
        }
      />
      <div className={styles.times}>
        <div className={styles.timeField}>
          <span>Starts</span>
          <label className={styles.now}>
            <input
              type="checkbox"
              checked={!start}
              disabled={disabled}
              onChange={(event) =>
                onChange({ start: event.target.checked ? "" : now, end })
              }
            />
            Now
          </label>
          <Clock
            label="Sale starts"
            value={start.slice(11) || "00:00"}
            disabled={disabled || !start}
            onChange={(time) =>
              onChange({ start: `${start.slice(0, 10)}T${time}`, end })
            }
          />
        </div>
        <div className={styles.timeField}>
          <span>Ends</span>
          <span className={styles.timeHint}>24-hour time</span>
          <Clock
            label="Sale ends"
            value={end.slice(11) || "23:59"}
            disabled={disabled || !end}
            onChange={(time) =>
              onChange({ start, end: `${end.slice(0, 10)}T${time}` })
            }
          />
        </div>
      </div>
    </div>
  )
}
