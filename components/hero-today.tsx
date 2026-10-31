"use client"

import { TodayPill, useStoreClock } from "@/components/store-hours"
import type { StoreSchedule } from "@/lib/store-hours"

export function HeroToday({ schedule }: { schedule: StoreSchedule }) {
  const clock = useStoreClock()
  // The slot stays mounted so the opposite caption never shifts.
  return (
    <div className="hero-today">
      {clock && <TodayPill schedule={schedule} clock={clock} compact />}
    </div>
  )
}
