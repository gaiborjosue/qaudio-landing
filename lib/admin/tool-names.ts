/** Canonical catalog names mapped to the original preview kinds. Historical
 * messages keep their original names; never rewrite event or interaction ids. */
const PREVIEW_TOOLS = {
  hours__set_weekly_hours: "set_weekly_hours",
  hours__save_hours_change: "save_hours_change",
  hours__delete_hours_change: "delete_hours_change",
  products__save_product: "save_product",
  products__delete_product: "delete_product",
  products__reorder_products: "reorder_products",
  news__save_news_post: "save_news_post",
  news__delete_news_post: "delete_news_post",
  deals__save_deal: "save_deal",
  deals__delete_deal: "delete_deal",
} as const

type PreviewTool = (typeof PREVIEW_TOOLS)[keyof typeof PREVIEW_TOOLS]

/** Only known write tools qualify; arbitrary namespace suffixes do not. */
export const SAVE_TOOLS = new Set<string>([
  ...Object.keys(PREVIEW_TOOLS),
  ...Object.values(PREVIEW_TOOLS),
])

export function previewToolName(name: string): PreviewTool | undefined {
  if (Object.hasOwn(PREVIEW_TOOLS, name)) {
    return PREVIEW_TOOLS[name as keyof typeof PREVIEW_TOOLS]
  }
  return Object.values(PREVIEW_TOOLS).find((legacy) => legacy === name)
}

/** Tools that open an editor in the chat. They save nothing (the owner saves
 * from the editor), so they need no approval or preview. */
const EDITOR_TOOLS = {
  products__open_editor: "product_editor",
  products__open_table: "product_table",
} as const

export function editorToolName(
  name: string
): (typeof EDITOR_TOOLS)[keyof typeof EDITOR_TOOLS] | undefined {
  return Object.hasOwn(EDITOR_TOOLS, name)
    ? EDITOR_TOOLS[name as keyof typeof EDITOR_TOOLS]
    : undefined
}
