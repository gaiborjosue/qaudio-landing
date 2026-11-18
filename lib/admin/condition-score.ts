// A used item's visual condition score, 0 to 10. It lives in the product's
// condition note as "9 out of 10" (the format imported from Webflow), beside
// any other terms ("Used (final sale) · 6 out of 10"), so the shop and the
// agent read the note as before. The admin's score sliders edit only that
// part.

export const SCORE_MAX = 10

const SCORE = /(?<!\d)(\d{1,2})\s*(?:out\s+of|\/)\s*10(?!\d)/i
const SEPARATOR = " · "

function find(note: string) {
  const match = SCORE.exec(note)
  return match && Number(match[1]) <= SCORE_MAX ? match : null
}

/** The note's score, or null when it has none. */
export function conditionScore(note: string): number | null {
  const match = find(note)
  return match ? Number(match[1]) : null
}

/** The note without its score, or the separator that joined it. */
export function conditionNotes(note: string) {
  const match = find(note)
  if (!match) return note
  const before = note.slice(0, match.index)
  const after = note.slice(match.index + match[0].length)
  if (before.endsWith(SEPARATOR)) {
    return before.slice(0, -SEPARATOR.length) + after
  }
  if (after.startsWith(SEPARATOR)) return before + after.slice(SEPARATOR.length)
  return before + after
}

/**
 * The note with `score` in place of its own, or added after its other terms;
 * null removes it. An unchanged score leaves the note exactly as it was.
 */
export function withConditionScore(note: string, score: number | null) {
  const match = find(note)
  if (match ? Number(match[1]) === score : score === null) return note
  if (score === null) return conditionNotes(note)
  const text = `${score} out of ${SCORE_MAX}`
  if (match) {
    return (
      note.slice(0, match.index) +
      text +
      note.slice(match.index + match[0].length)
    )
  }
  return note.trim() ? `${note}${SEPARATOR}${text}` : text
}

/**
 * The note with `notes` typed beside its score. A score typed into the notes
 * replaces the old one.
 */
export function withConditionNotes(note: string, notes: string) {
  return find(notes) ? notes : withConditionScore(notes, conditionScore(note))
}
