"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import styles from "./choice.module.css"

export type ChoiceOption = {
  value: string
  label: string
  /** A product condition's color cue: "new", "demo", or "used". */
  tone?: string
}

/**
 * shadcn's Select (Base UI) at the admin's scale, for the product editor and
 * table: a value, its options, and a placeholder. An empty string means
 * nothing is chosen. Options with a `tone` carry the condition colors, and so
 * does the trigger when the chosen one has one.
 */
export function Choice({
  value,
  options,
  onChange,
  placeholder,
  small = false,
  openDown = false,
  disabled,
  className,
  ...aria
}: {
  value: string
  options: readonly ChoiceOption[]
  onChange: (value: string) => void
  placeholder?: string
  small?: boolean
  /** Keep filter menus below their trigger, even with a selected option. */
  openDown?: boolean
  disabled?: boolean
  className?: string
  id?: string
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
  "aria-invalid"?: true
}) {
  const chosen = options.find((option) => option.value === value)
  return (
    <Select
      items={options.map(({ value, label }) => ({ value, label }))}
      value={value || null}
      onValueChange={(next) => onChange(typeof next === "string" ? next : "")}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(styles.trigger, small && styles.small, className)}
        data-tone={chosen?.tone}
        {...aria}
      >
        {chosen?.tone && <span className={styles.dot} aria-hidden="true" />}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        className={cn(styles.content, "motion-reduce:animate-none")}
        alignItemWithTrigger={!openDown}
        collisionAvoidance={
          openDown ? { side: "none", align: "shift" } : undefined
        }
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className={styles.item}
            data-tone={option.tone}
          >
            {option.tone && <span className={styles.dot} aria-hidden="true" />}
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
