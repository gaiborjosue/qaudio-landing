"use client"

import { Choice } from "./choice"
import styles from "./clock.module.css"

const options = (count: number) =>
  Array.from({ length: count }, (_, value) => {
    const text = String(value).padStart(2, "0")
    return { value: text, label: text }
  })
const HOURS = options(24)
const MINUTES = options(60)

/**
 * A 24-hour "HH:MM" as hour and minute dropdowns, so admin times never open
 * the browser's own time picker.
 */
export function Clock({
  label,
  value,
  disabled = false,
  onChange,
}: {
  /** Names both dropdowns: "<label> hour", "<label> minute". */
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const [hour = "00", minute = "00"] = value.split(":")
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
