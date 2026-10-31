export const STORE_TIME_ZONE = "America/New_York"

/** 24-hour "HH:MM" times in store time. */
export type OpenHours = { open: string; close: string }
export type DayHours = OpenHours | "appointment" | "closed"

export type HoursChange = {
  /** First affected date, "YYYY-MM-DD" in store time. */
  start: string
  /** Last affected date, inclusive. Defaults to `start`. */
  end?: string
  hours: DayHours
  note?: string
}

/**
 * The store's hours, read from Supabase by lib/store-hours-data.ts: the
 * regular week (Monday first) and dated changes that override it.
 */
export type StoreSchedule = {
  weekly: readonly DayHours[]
  changes: readonly HoursChange[]
}

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const

export const PHONE_HOURS = "10\u00a0am\u00a0–\u00a07\u00a0pm"

const DAY_MS = 86_400_000
const NOTICE_HORIZON_DAYS = 60

const clockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: STORE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})
const shortDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
})
const monthDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
})

export type StoreClock = { date: string; minutes: number }

/** The store's local calendar date and minutes since midnight. */
export function storeClock(now: Date): StoreClock {
  const parts = Object.fromEntries(
    clockFormat.formatToParts(now).map((part) => [part.type, part.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

function utc(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function addDays(date: string, days: number) {
  return new Date(utc(date).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

/** Monday = 0. */
export function weekdayIndex(date: string) {
  return (utc(date).getUTCDay() + 6) % 7
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

function formatTime(time: string, withPeriod: boolean) {
  const [hours, minutes] = time.split(":").map(Number)
  const clock = `${hours % 12 || 12}:${String(minutes).padStart(2, "0")}`
  return withPeriod ? `${clock}\u00a0${hours < 12 ? "am" : "pm"}` : clock
}

export function formatHours(hours: DayHours) {
  if (hours === "appointment") return "By appointment"
  if (hours === "closed") return "Closed"
  const samePeriod =
    toMinutes(hours.open) < 720 === toMinutes(hours.close) < 720
  return `${formatTime(hours.open, !samePeriod)} – ${formatTime(hours.close, true)}`
}

export function hoursOn(schedule: StoreSchedule, date: string) {
  const change = schedule.changes.find(
    (entry) => date >= entry.start && date <= (entry.end ?? entry.start)
  )
  return {
    hours: change?.hours ?? schedule.weekly[weekdayIndex(date)] ?? "closed",
    change,
  }
}

/** Monday–Sunday rows, each resolved to its next date from today. */
export function weekSchedule(schedule: StoreSchedule, today: string) {
  return WEEKDAYS.map((name, index) => {
    const offset = (index - weekdayIndex(today) + 7) % 7
    const date = addDays(today, offset)
    return { name, date, isToday: offset === 0, ...hoursOn(schedule, date) }
  })
}

export function upcomingChanges(schedule: StoreSchedule, today: string) {
  const horizon = addDays(today, NOTICE_HORIZON_DAYS)
  return schedule.changes
    .filter(
      (entry) => (entry.end ?? entry.start) >= today && entry.start <= horizon
    )
    .sort((a, b) => a.start.localeCompare(b.start))
}

export function formatMonthDay(date: string) {
  return monthDay.format(utc(date))
}

export function formatChangeDates({ start, end = start }: HoursChange) {
  if (end === start) return shortDate.format(utc(start))
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  return `${formatMonthDay(start)} – ${
    sameMonth ? utc(end).getUTCDate() : formatMonthDay(end)
  }`
}

/** e.g. "tomorrow at 1:00 pm" */
function nextOpening(schedule: StoreSchedule, today: string) {
  for (let offset = 1; offset <= 21; offset++) {
    const date = addDays(today, offset)
    const { hours } = hoursOn(schedule, date)
    if (typeof hours !== "object") continue
    const day =
      offset === 1
        ? "tomorrow"
        : offset < 7
          ? WEEKDAYS[weekdayIndex(date)]
          : formatMonthDay(date)
    return `${day} at ${formatTime(hours.open, true)}`
  }
}

export function storeStatus(
  schedule: StoreSchedule,
  { date, minutes }: StoreClock
) {
  const { hours } = hoursOn(schedule, date)
  const next = nextOpening(schedule, date)
  // The row already says "Closed" or "By appointment", so only add what's next.
  if (typeof hours !== "object") {
    const text = next ? `Opens ${next}` : formatHours(hours)
    return { open: false, text, brief: text }
  }
  if (minutes >= toMinutes(hours.open) && minutes < toMinutes(hours.close)) {
    const text = `Open now · until ${formatTime(hours.close, true)}`
    return { open: true, text, brief: text }
  }
  if (minutes < toMinutes(hours.open)) {
    const text = `Opens today at ${formatTime(hours.open, true)}`
    return { open: false, text, brief: text }
  }
  // `brief` drops "Closed now" where the closed tint already says it.
  return {
    open: false,
    text: next ? `Closed now · opens ${next}` : "Closed now",
    brief: next ? `Opens ${next}` : "Closed now",
  }
}
