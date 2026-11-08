"use client"

import { useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { CalendarDays } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import {
  formatStoreDateTime,
  STORE_DATETIME,
  toStoreDateTime,
} from "@/lib/admin/store-time"
import adminStyles from "./admin.module.css"
import { Clock } from "./clock"
import styles from "./date-time-picker.module.css"

const pad = (value: number) => String(value).padStart(2, "0")

// The calendar works in the browser's local dates; the picked day is read as
// a store date (America/New_York), like every admin time.
const toDay = (date: string) => {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(year, month - 1, day)
}
const fromDay = (day: Date) =>
  `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`

/**
 * One store-time "YYYY-MM-DDTHH:MM" (or "" for none) on the admin calendar
 * and clock, instead of the browser's datetime picker. The trigger takes the
 * id, so a `<label htmlFor>` names it.
 */
export function DateTimePicker({
  value,
  onChange,
  label,
  placeholder = "Pick a date",
  defaultTime = "09:00",
  disabled = false,
  ...trigger
}: {
  value: string
  onChange: (value: string) => void
  /** Names the calendar dialog and the clock. */
  label: string
  placeholder?: string
  /** The time a newly picked day starts with. */
  defaultTime?: string
  disabled?: boolean
  id?: string
  "aria-invalid"?: true
  "aria-describedby"?: string
}) {
  const [open, setOpen] = useState(false)
  const set = STORE_DATETIME.test(value) ? value : ""
  const day = set ? toDay(set.slice(0, 10)) : undefined
  const time = set ? set.slice(11) : defaultTime
  const today = toDay(toStoreDateTime(new Date()).slice(0, 10))

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        type="button"
        className={styles.trigger}
        disabled={disabled}
        data-empty={!set || undefined}
        {...trigger}
      >
        <CalendarDays size={15} strokeWidth={1.6} aria-hidden="true" />
        <span>{set ? formatStoreDateTime(set) : placeholder}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className={styles.positioner}
        >
          <Popover.Popup className={styles.popup} aria-label={label}>
            <Calendar
              mode="single"
              selected={day}
              onSelect={(picked) =>
                onChange(picked ? `${fromDay(picked)}T${time}` : "")
              }
              defaultMonth={day ?? today}
              className={adminStyles.calendar}
              autoFocus
            />
            <div className={styles.footer}>
              <span className={styles.timeLabel}>
                Time <span>(store time)</span>
              </span>
              <Clock
                label={label}
                value={time}
                disabled={!set}
                onChange={(next) => onChange(`${set.slice(0, 10)}T${next}`)}
              />
              <Popover.Close className={adminStyles.primary}>Done</Popover.Close>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
