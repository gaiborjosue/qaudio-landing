export const LOADER_COOLDOWN_MS = 60_000
export const LOADER_SHOWN_KEY = "qaudio:loader-shown-at"

export function loaderNeedsMinimum(lastShown: number | null, now: number) {
  return (
    lastShown === null ||
    !Number.isFinite(lastShown) ||
    lastShown < 0 ||
    lastShown > now ||
    now - lastShown >= LOADER_COOLDOWN_MS
  )
}
