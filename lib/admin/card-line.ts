import "server-only"
import { generateText } from "ai"
import { fastModel } from "@/agent/lib/models"

// The product card's one line, written by the fast copywriting model (the
// copywriter subagent's model) when the owner saves a product from the chat's
// editor without writing one. It follows the copywriter's rules.

const SYSTEM = `You write the one-line product card text for Q Audio, an independent hi-fi shop in Cambridge, Massachusetts.

Reply with only that line: one sentence, 300 characters at most, saying what the product is and what sets it apart, from the material you're given.

- Use only facts in the material. Never invent specs, awards, prices, or availability.
- Plain, confident, specific. No hype words ("amazing", "game-changing", "unparalleled"), no exclamation marks, no emoji, no quotation marks around it.
- Keep model names, units, and numbers exactly as given.
- American English, curly apostrophes.`

const MAX = 300

/** Markdown down to plain words. */
function plain(markdown: string) {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#{1,6}|[-*+•]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|\*|_)/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** At most 300 characters, cut at a word. */
function fit(text: string) {
  if (text.length <= MAX) return text
  const cut = text.slice(0, MAX - 1)
  const space = cut.lastIndexOf(" ")
  return `${space > 200 ? cut.slice(0, space) : cut}…`
}

/** The description's first sentence: the line when the model can't help. */
function opening(description: string) {
  const text = plain(description)
  return fit(text.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? text)
}

/**
 * A card line for a product, from its name, brand, category, condition, and
 * description. Falls back to the description's first sentence if the model
 * fails or takes longer than 15 seconds, so a save never waits on it.
 */
export async function writeCardLine(product: {
  name: string
  brand: string
  category: string
  condition: string
  description: string
}) {
  if (!product.description.trim()) return ""
  try {
    const { text } = await generateText({
      model: fastModel,
      system: SYSTEM,
      prompt: [
        `Product: ${product.name}`,
        `Brand: ${product.brand}`,
        `Category: ${product.category}`,
        `Condition: ${product.condition}`,
        "",
        "Description:",
        product.description,
      ].join("\n"),
      maxOutputTokens: 200,
      abortSignal: AbortSignal.timeout(15_000),
    })
    const line = fit(
      text
        .replace(/^["“]|["”]$/g, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    return line || opening(product.description)
  } catch {
    return opening(product.description)
  }
}
