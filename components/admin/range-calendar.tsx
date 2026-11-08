"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type DateRange, type Matcher } from "react-day-picker"
import styles from "./range-calendar.module.css"

/**
 * An inline range calendar drawn like the Arc date range picker (the product
 * editor's Sale dates): round ends, one soft bar across each week, a dot for
 * today. It stays open in place, so it fits inside a chat message, where
 * Arc's expanding panel would be clipped.
 */
export function RangeCalendar({
  selected,
  onSelect,
  defaultMonth,
  disabled,
  className,
}: {
  selected: DateRange | undefined
  onSelect: (range: DateRange | undefined) => void
  defaultMonth?: Date
  disabled?: Matcher | Matcher[]
  className?: string
}) {
  return (
    <DayPicker
      mode="range"
      selected={selected}
      onSelect={onSelect}
      defaultMonth={defaultMonth}
      disabled={disabled}
      resetOnSelect
      showOutsideDays={false}
      className={[styles.root, className].filter(Boolean).join(" ")}
      classNames={{
        months: styles.months,
        month: styles.month,
        nav: styles.nav,
        button_previous: styles.navButton,
        button_next: styles.navButton,
        month_caption: styles.caption,
        caption_label: styles.captionLabel,
        month_grid: styles.grid,
        weekdays: styles.weekdays,
        weekday: styles.weekday,
        week: styles.week,
        day: styles.day,
        day_button: styles.dayButton,
        range_start: styles.rangeStart,
        range_middle: styles.rangeMiddle,
        range_end: styles.rangeEnd,
        selected: styles.selected,
        today: styles.today,
        disabled: styles.disabled,
        hidden: styles.hidden,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
          ),
      }}
    />
  )
}
