// Remembers the scroll position of each history entry. Browsers restore it
// before the pinned story has laid out its spacer, so back/forward/reload land
// short; the scroll experience re-applies it once the layout has settled.
const STORAGE_PREFIX = "qaudio:scroll:"
const ID_FIELD = "qaudioScrollId"

// Only extend history states written by the Next router (marked `__NA`): Next
// reloads the page when it traverses to a state without that marker.
function entryId(create: boolean) {
  const state = window.history.state as Record<string, unknown> | null
  if (!state?.__NA) return null
  const existing = state[ID_FIELD]
  if (typeof existing === "string") return existing
  if (!create) return null
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  window.history.replaceState({ ...state, [ID_FIELD]: id }, "")
  return id
}

export function readScrollPosition() {
  try {
    const id = entryId(false)
    const value = id ? window.sessionStorage.getItem(STORAGE_PREFIX + id) : null
    const position = value === null ? NaN : Number(value)
    return Number.isFinite(position) && position >= 0 ? position : null
  } catch {
    return null
  }
}

function writeScrollPosition() {
  try {
    const id = entryId(true)
    if (id) {
      window.sessionStorage.setItem(
        STORAGE_PREFIX + id,
        String(Math.round(window.scrollY))
      )
    }
  } catch {
    // Storage can be unavailable or full; losing the position is harmless.
  }
}

/**
 * Starts saving the position of the current history entry. Call it only after
 * any restore has run, so transient positions during load can't overwrite it.
 */
export function rememberScrollPosition() {
  let frame = 0
  const onScroll = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      writeScrollPosition()
    })
  }
  writeScrollPosition()
  window.addEventListener("scroll", onScroll, { passive: true })
  window.addEventListener("pagehide", writeScrollPosition)
  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener("scroll", onScroll)
    window.removeEventListener("pagehide", writeScrollPosition)
  }
}
