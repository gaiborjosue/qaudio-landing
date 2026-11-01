import { storeClock } from "../store-hours"

// Store-time ("America/New_York") timestamps for the admin agent, written as
// "YYYY-MM-DDTHH:MM" so the model never has to work out a UTC offset.

export const STORE_DATETIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/

/** Store-time "YYYY-MM-DDTHH:MM" of an instant. */
export function toStoreDateTime(instant: Date | string) {
  const { date, minutes } = storeClock(new Date(instant))
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0")
  return `${date}T${hours}:${String(minutes % 60).padStart(2, "0")}`
}

// Store wall-clock minus UTC at an instant, in milliseconds.
function storeOffset(instant: number) {
  const { date, minutes } = storeClock(new Date(instant))
  const [year, month, day] = date.split("-").map(Number)
  const wall = Date.UTC(year, month - 1, day) + minutes * 60_000
  return wall - Math.floor(instant / 60_000) * 60_000
}

/** ISO UTC timestamp of a store-time "YYYY-MM-DDTHH:MM". */
export function fromStoreDateTime(local: string) {
  const [date, time] = local.split("T")
  const [year, month, day] = date.split("-").map(Number)
  const [hours, minutes] = time.split(":").map(Number)
  const wall = Date.UTC(year, month - 1, day, hours, minutes)
  // Two passes settle the offset on either side of a daylight-saving change.
  let instant = wall - storeOffset(wall)
  instant = wall - storeOffset(instant)
  return new Date(instant).toISOString()
}
