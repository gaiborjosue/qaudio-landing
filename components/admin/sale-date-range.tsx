"use client"

import { useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { CalendarDays } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { calendarDay, saleDatesFromRange } from "@/lib/admin/sale-dates"
import { formatStoreDateTime, toStoreDateTime } from "@/lib/admin/store-time"
import { Choice } from "./choice"
import styles from "./sale-date-range.module.css"

const options = (count: number) =>
  Array.from({ length: count }, (_, value) => {
    const text = String(value).padStart(2, "0")
    return { value: text, label: text }
  })
const HOURS = options(24)
const MINUTES = options(60)

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

/** A range on the existing shadcn calendar, with store-time hour/minute selects. */
export function SaleDateRange({
  start,
  end,
  onChange,
  disabled,
  ...aria
}: {
  start: string
  end: string
  onChange: (dates: { start: string; end: string }) => void
  disabled?: boolean
  id: string
  "aria-labelledby": string
}) {
  const [open, setOpen] = useState(false)
  const now = toStoreDateTime(new Date())
  const today = now.slice(0, 10)
  const range = {
    from: calendarDay(start || today),
    to: end ? calendarDay(end) : undefined,
  }
  const summary = `${start ? formatStoreDateTime(start) : "Now"} – ${end ? formatStoreDateTime(end) : "Pick end date"}`
  return (
    <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
      <Popover.Trigger
        type="button"
        className={styles.trigger}
        disabled={disabled}
        {...aria}
      >
        <CalendarDays size={16} aria-hidden="true" />
        <span>{summary}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className={styles.positioner}
        >
          <Popover.Popup className={styles.popup}>
            <Popover.Title className={styles.title}>
              Sale dates · Store time
            </Popover.Title>
            <Calendar
              mode="range"
              selected={range}
              defaultMonth={range.from}
              onSelect={(next) =>
                onChange(saleDatesFromRange(next, start, end, today))
              }
              className={styles.calendar}
              autoFocus
            />
            <div className={styles.times}>
              <div className={styles.timeField}>
                <span>Starts</span>
                <label className={styles.now}>
                  <input
                    type="checkbox"
                    checked={!start}
                    onChange={(event) =>
                      onChange({ start: event.target.checked ? "" : now, end })
                    }
                  />
                  Now
                </label>
                <Clock
                  label="Sale starts"
                  value={start.slice(11) || "00:00"}
                  disabled={!start}
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
                  disabled={!end}
                  onChange={(time) =>
                    onChange({ start, end: `${end.slice(0, 10)}T${time}` })
                  }
                />
              </div>
            </div>
            <button
              type="button"
              className={styles.done}
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
