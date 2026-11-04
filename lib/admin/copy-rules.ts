// Q Audio's product copy rules, shared by the card line writer
// (card-line.ts) and Prefill with Tune (product-page.ts). They follow the
// copywriter subagent's instructions (agent/subagents/copywriter). Pure, so
// tests and either side can import it.

/** Facts and voice, for any product copy. */
export const COPY_RULES = `- Use only facts in the material. Never invent specs, awards, prices, or availability. If the material is thin, write less.
- Plain, confident, specific. No hype words ("amazing", "game-changing", "unparalleled"), no exclamation marks, no emoji.
- Keep model names, units, and numbers exactly as given.
- American English, curly quotes and apostrophes.`

/** The product card's line. */
export const CARD_LINE_RULES = `One sentence, 300 characters at most, saying what the product is and what sets it apart. No quotation marks around it.`

/** The details page's Markdown description. */
export const DESCRIPTION_RULES = `In this order:
1. One short opening line that says what the product is (it's shown as the intro).
2. A blank line, then 3 to 8 feature bullets ("- "), most useful first, each a short sentence fragment ending with a period.
3. Optionally, a blank line and one closing line in bold (**…**): a single memorable fact, such as where it's made ("**Hand assembled in the USA**").
Use only this Markdown: paragraphs, "- " bullets, and **bold**. No headings unless the material has clearly separate sections; no links, tables, images, or HTML.`

export const CARD_LINE_MAX = 300

/** At most 300 characters, cut at a word, without wrapping quotes. */
export function fitCardLine(text: string) {
  const line = text
    .replace(/^\s*["“]|["”]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (line.length <= CARD_LINE_MAX) return line
  const cut = line.slice(0, CARD_LINE_MAX - 1)
  const space = cut.lastIndexOf(" ")
  return `${space > 200 ? cut.slice(0, space) : cut}…`
}
