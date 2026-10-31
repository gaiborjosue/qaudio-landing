"use client"

import { TodayPill, useStoreClock } from "@/components/store-hours"

export function HeroToday() {
  const clock = useStoreClock()
  // The slot stays mounted so the opposite caption never shifts.
  return (
    <div className="hero-today">
      {clock && <TodayPill clock={clock} compact />}
    </div>
  )
}
