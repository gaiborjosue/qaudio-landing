// Calendar Date objects represent store calendar days, never UTC instants.
const pad = (part: number) => String(part).padStart(2, "0")

export function calendarDay(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function storeDay(day: Date) {
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

export function saleDatesFromRange(
  range: { from?: Date; to?: Date } | undefined,
  start: string,
  end: string,
  today: string
) {
  if (!range?.from) return { start: "", end: "" }
  const first = storeDay(range.from)
  return {
    start:
      !start && first === today ? "" : `${first}T${start.slice(11) || "00:00"}`,
    end: range.to ? `${storeDay(range.to)}T${end.slice(11) || "23:59"}` : "",
  }
}
