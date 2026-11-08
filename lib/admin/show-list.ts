import { z } from "zod"

/** Shows a list in the admin chat: the agent's generative UI outlet. */
export const LIST_TOOL = "show_list"

const line = (max: number) => z.string().trim().min(1).max(max)

// Site pages only: the chat links them and, for a product, adds its photo.
const SITE_PATH = /^\/(?!\/)[\w\-.~/]*$/
const PRODUCT_PATH = /^\/products\/([\w-]+)\/?$/

export const listItemSchema = z.object({
  title: line(120),
  detail: line(160).optional().describe("One short line under the title."),
  value: line(32).optional().describe('The main figure, e.g. "$439.99".'),
  was: line(32)
    .optional()
    .describe("An earlier figure it replaces, shown struck through."),
  tags: z
    .array(line(24))
    .max(3)
    .optional()
    .describe('Short labels, e.g. "Draft", "Pair", "Ends Jan 4".'),
  href: z
    .string()
    .max(200)
    .regex(SITE_PATH)
    .optional()
    .describe('A site page, e.g. "/products/<slug>" (adds its photo).'),
})

export const showListInputSchema = z.object({
  title: line(80).optional(),
  items: z.array(listItemSchema).min(1).max(30),
})

export type ListItem = z.infer<typeof listItemSchema>
export type ShowListInput = z.infer<typeof showListInputSchema>

/** The product slug a link points at, if it's a product page. */
export const productSlug = (href: string | undefined) =>
  href?.match(PRODUCT_PATH)?.[1]

/** The list as Markdown, for copying a reply. */
export function listText({ title, items }: ShowListInput) {
  const rows = items.map((item) => {
    const figure = [item.was && `~~${item.was}~~`, item.value]
      .filter(Boolean)
      .join(" → ")
    const extra = [item.detail, ...(item.tags ?? [])]
      .filter(Boolean)
      .join(" · ")
    return `- ${item.title}${figure ? `: ${figure}` : ""}${extra ? ` (${extra})` : ""}`
  })
  return [title && `**${title}**`, ...rows].filter(Boolean).join("\n")
}
