// What changed between two texts, word by word, for the approval cards:
// unchanged runs, then what was removed and what was added in their place.
// Pure, so the cards and tests share it.

export type DiffPart = { kind: "same" | "removed" | "added"; text: string }

/** Words, numbers, single punctuation marks, and whitespace runs. */
const tokenize = (text: string) =>
  text.match(/[\p{L}\p{N}]+|\s+|[^\p{L}\p{N}\s]/gu) ?? []

// Past this many token pairs, a change is shown whole rather than worked
// out word by word.
const LIMIT = 250_000

type Op = { kind: DiffPart["kind"] | "both"; text: string }

/** The longest common subsequence's edit script between two token lists. */
function edits(a: string[], b: string[]): Op[] {
  const width = b.length + 1
  const table = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: "same", text: a[i] })
      i++
      j++
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push({ kind: "removed", text: a[i++] })
    } else {
      ops.push({ kind: "added", text: b[j++] })
    }
  }
  while (i < a.length) ops.push({ kind: "removed", text: a[i++] })
  while (j < b.length) ops.push({ kind: "added", text: b[j++] })
  return ops
}

/**
 * `before` and `after` as unchanged, removed, and added runs, in reading
 * order (each removal before what replaces it). A space between two
 * changes joins them, so "red car" → "blue van" reads as one replacement.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokenize(before)
  const b = tokenize(after)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const middleA = a.slice(start, endA)
  const middleB = b.slice(start, endB)
  const middle: Op[] =
    middleA.length * middleB.length > LIMIT
      ? [
          { kind: "removed", text: middleA.join("") },
          { kind: "added", text: middleB.join("") },
        ]
      : edits(middleA, middleB)
  const ops: Op[] = [
    { kind: "same", text: a.slice(0, start).join("") },
    ...middle.map((op, index) =>
      op.kind === "same" &&
      /^\s+$/.test(op.text) &&
      index > 0 &&
      middle[index - 1].kind !== "same" &&
      middle[index + 1] &&
      middle[index + 1].kind !== "same"
        ? { kind: "both" as const, text: op.text }
        : op
    ),
    { kind: "same", text: a.slice(endA).join("") },
  ]

  const parts: DiffPart[] = []
  const push = (kind: DiffPart["kind"], text: string) => {
    if (!text) return
    const last = parts.at(-1)
    if (last?.kind === kind) last.text += text
    else parts.push({ kind, text })
  }
  let removed = ""
  let added = ""
  const flush = () => {
    push("removed", removed)
    push("added", added)
    removed = added = ""
  }
  for (const op of ops) {
    if (op.kind === "same") {
      flush()
      push("same", op.text)
    } else {
      if (op.kind !== "added") removed += op.text
      if (op.kind !== "removed") added += op.text
    }
  }
  flush()
  return parts
}
