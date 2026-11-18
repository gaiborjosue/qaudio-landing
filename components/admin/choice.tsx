"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { byName } from "@/lib/admin/alphabetical"
import { cn } from "@/lib/utils"
import styles from "./choice.module.css"

export type ChoiceOption = {
  value: string
  label: string
  /** A product condition's color cue: "new", "demo", or "used". */
  tone?: string
  /** Stays above the A–Z options, like "All brands" or "No brand". */
  first?: boolean
}

/**
 * shadcn's Select (Base UI) at the admin's scale, for the product editor and
 * table: a value, its options, and a placeholder. An empty string means
 * nothing is chosen. Options list A–Z by label, after any marked `first`.
 * Options with a `tone` carry the condition colors, and so does the trigger
 * when the chosen one has one.
 */
export function Choice({
  value,
  options,
  onChange,
  placeholder,
  small = false,
  disabled,
  className,
  ...aria
}: {
  value: string
  options: readonly ChoiceOption[]
  onChange: (value: string) => void
  placeholder?: string
  small?: boolean
  disabled?: boolean
  className?: string
  id?: string
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
  "aria-invalid"?: true
}) {
  const chosen = options.find((option) => option.value === value)
  const listed = options.toSorted(
    (a, b) => Number(!!b.first) - Number(!!a.first) || byName(a.label, b.label)
  )
  return (
    <Select
      items={listed.map(({ value, label }) => ({ value, label }))}
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
        <SelectValue
          className={styles.value}
          placeholder={placeholder}
          title={chosen?.label}
        />
      </SelectTrigger>
      <SelectContent
        className={cn(styles.content, "motion-reduce:animate-none")}
        alignItemWithTrigger={false}
      >
        {listed.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className={styles.item}
            data-tone={option.tone}
          >
            {option.tone && <span className={styles.dot} aria-hidden="true" />}
            <span className={styles.optionLabel} title={option.label}>
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
