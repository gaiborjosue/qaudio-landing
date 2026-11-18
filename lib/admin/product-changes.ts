import { descriptionColumns, isUsedEquipment } from "../catalog"
import type { Database } from "../supabase/database"
import { withConditionScore } from "./condition-score"
import type { ProductChanges } from "./schemas"

// A product change from the agent (products__update_products) as the
// columns it writes. The save (lib/admin/product-save.ts) and the approval
// card's preview both use it, so the card shows exactly what's written.
// Pure; relative imports, because the agent imports this too.

export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"]

/** The saved fields a change builds on. */
export type ProductBasis = {
  category_slug: string
  condition: string
  condition_note: string
  availability: string
  status: string
}

// Written as given.
const COLUMNS = [
  "slug",
  "category_slug",
  "brand_slug",
  "condition",
  "availability",
  "price_cents",
  "msrp_cents",
  "price_unit",
  "ready_for_audition",
  "status",
  "manufacturer_url",
] as const

/**
 * The columns `changes` write over `current`; photos are written apart.
 * A score goes into the condition note beside its other terms, and used gear
 * that's sold leaves the shop as a draft, as in the product form.
 */
export function productUpdate(
  current: ProductBasis,
  changes: ProductChanges
): ProductUpdate {
  const row: Record<string, unknown> = {}
  for (const key of COLUMNS) {
    if (changes[key] !== undefined) row[key] = changes[key]
  }
  if (changes.name !== undefined) row.name = changes.name.trim()
  if (changes.short_description !== undefined) {
    row.short_description = changes.short_description.trim()
  }
  if (changes.description !== undefined) {
    Object.assign(row, descriptionColumns(changes.description))
  }
  if (
    changes.condition_note !== undefined ||
    changes.condition_score !== undefined
  ) {
    const note = changes.condition_note ?? current.condition_note
    const scored =
      changes.condition_score === undefined
        ? note
        : withConditionScore(note, changes.condition_score)
    if (scored !== current.condition_note) row.condition_note = scored
  }
  const update = row as ProductUpdate
  const after = { ...current, ...update }
  if (
    (["availability", "condition", "category_slug", "status"] as const).some(
      (key) => changes[key] !== undefined
    ) &&
    after.availability === "sold" &&
    isUsedEquipment(after.category_slug, after.condition) &&
    after.status !== "draft"
  ) {
    update.status = "draft"
  }
  return update
}

/** What a change can touch, in the product form's order. */
export const CHANGE_FIELDS = [
  "name",
  "slug",
  "category_slug",
  "brand_slug",
  "condition",
  "condition_note",
  "availability",
  "price_cents",
  "msrp_cents",
  "price_unit",
  "ready_for_audition",
  "status",
  "manufacturer_url",
  "short_description",
  "description",
  "images",
] as const
export type ChangeField = (typeof CHANGE_FIELDS)[number]

export const CHANGE_LABELS: Record<ChangeField, string> = {
  name: "Name",
  slug: "Address",
  category_slug: "Category",
  brand_slug: "Brand",
  condition: "Condition",
  condition_note: "Condition notes",
  availability: "Availability",
  price_cents: "Selling price",
  msrp_cents: "List price",
  price_unit: "Sold",
  ready_for_audition: "Audition",
  status: "Status",
  manufacturer_url: "Manufacturer page",
  short_description: "Card line",
  description: "Description",
  images: "Photos",
}

/** The fields an update writes (a description is one field). */
export function writtenFields(
  update: ProductUpdate,
  changes: ProductChanges
): ChangeField[] {
  return CHANGE_FIELDS.filter((field) =>
    field === "images"
      ? changes.images !== undefined
      : field === "description"
        ? update.description_intro !== undefined
        : update[field] !== undefined
  )
}
