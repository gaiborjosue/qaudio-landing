import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../supabase/database.types"
import type { EndSaleInput, ProductSaleInput, SaleInput } from "./schemas"
import {
  formatStoreDateTime,
  formatStoreDay,
  fromStoreDateTime,
} from "./store-time"
import type { Fail } from "./uploads"

// Time-limited sales: the agent's products__save_sale and products__end_sale
// tools, and their approval card. The prices are worked out here from the
// tool's input alone, so the card shows exactly what the tool saves. A sale
// keeps price_cents (the regular price) and msrp_cents; the site shows
// sale_price_cents only inside the window (lib/catalog.ts sellingPrice).
// Relative imports, because the agent imports this too.

type Supabase = SupabaseClient<Database>
type Discount = NonNullable<SaleInput["discount"]>

/** One product's line on the sale: its prices, or why it can't go on sale. */
export type SaleLine = {
  id: string
  name: string
  /** The regular selling price. */
  price_cents: number
  msrp_cents: number | null
  /** What the discount came off. */
  base_cents: number
  sale_price_cents: number
  problem: string | null
}

/** A price with the discount taken off, rounded to the cent or dollar. */
export function discountedPrice(
  base: number,
  discount: Discount,
  rounding: SaleInput["rounding"] = "cent"
) {
  const raw =
    discount.kind === "percent"
      ? (base * (100 - discount.percent)) / 100
      : base - discount.cents
  return rounding === "dollar" ? Math.round(raw / 100) * 100 : Math.round(raw)
}

/** Every product's sale price, as the tool will save it. */
export function saleLines(sale: SaleInput): SaleLine[] {
  return sale.products.map((product) => {
    const base =
      sale.off === "msrp" && product.msrp_cents !== null
        ? product.msrp_cents
        : product.price_cents
    const price =
      product.sale_price_cents ??
      (sale.discount ? discountedPrice(base, sale.discount, sale.rounding) : 0)
    return {
      id: product.id,
      name: product.name,
      price_cents: product.price_cents,
      msrp_cents: product.msrp_cents,
      base_cents: base,
      sale_price_cents: price,
      problem:
        price <= 0
          ? "The discount is more than its price."
          : price >= product.price_cents
            ? "Its regular price is already this low or lower."
            : null,
    }
  })
}

/** "25% off MSRP", "$100 off", or "Set prices": what the sale takes off. */
export function saleDiscountLabel(sale: SaleInput) {
  if (!sale.discount) return "Set prices"
  const amount =
    sale.discount.kind === "percent"
      ? `${sale.discount.percent}%`
      : `$${(sale.discount.cents / 100).toLocaleString("en-US", {
          maximumFractionDigits: 2,
        })}`
  return `${amount} off${sale.off === "msrp" ? " MSRP" : ""}`
}

/** "Now until Jan 4, 2027, 11:59 pm" or "Nov 10, … until …". */
export function saleWindowLabel(
  sale: Pick<SaleInput, "starts_at" | "ends_at">
) {
  const start =
    sale.starts_at === "now" ? "Now" : formatStoreDateTime(sale.starts_at)
  return `${start} until ${formatStoreDateTime(sale.ends_at)}`
}

/**
 * A product's sale as the admin lists it, at store time `now`: "Sale $974
 * until Jan 4", "Sale $974 from Nov 10", or "Sale ended Jan 4".
 */
export function saleStatus(sale: ProductSaleInput, now: string) {
  const price = `$${(sale.price_cents / 100).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}`
  if (sale.ends_at <= now) return `Sale ended ${formatStoreDay(sale.ends_at)}`
  if (sale.starts_at && sale.starts_at > now) {
    return `Sale ${price} from ${formatStoreDay(sale.starts_at)}`
  }
  return `Sale ${price} until ${formatStoreDay(sale.ends_at)}`
}

/**
 * Puts the products on sale, as the admin. Refuses when a product's prices
 * changed since the agent read them (the card showed those), or when a
 * product can't take the sale price.
 */
export async function saveSale(
  supabase: Supabase,
  sale: SaleInput,
  fail: Fail
) {
  const ids = sale.products.map((product) => product.id)
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price_cents, msrp_cents")
    .in("id", ids)
  if (error) throw fail("Sale", error)
  const current = new Map(data.map((row) => [row.id, row]))
  const changed = sale.products.filter((product) => {
    const row = current.get(product.id)
    return (
      !row ||
      row.price_cents !== product.price_cents ||
      row.msrp_cents !== product.msrp_cents
    )
  })
  if (changed.length > 0) {
    throw new Error(
      `Sale: ${changed.map((product) => product.name).join(", ")} changed or no longer exist${changed.length === 1 ? "s" : ""}. Read the products again with products__list_catalog and propose the sale again.`
    )
  }
  const lines = saleLines(sale)
  const problems = lines.filter((line) => line.problem)
  if (problems.length > 0) {
    throw new Error(
      `Sale: ${problems.map((line) => `${line.name}: ${line.problem}`).join(" ")} Leave those out or change the discount.`
    )
  }
  const starts =
    sale.starts_at === "now" ? null : fromStoreDateTime(sale.starts_at)
  const ends = fromStoreDateTime(sale.ends_at)
  const results = await Promise.all(
    lines.map((line) =>
      supabase
        .from("products")
        .update({
          sale_price_cents: line.sale_price_cents,
          sale_starts_at: starts,
          sale_ends_at: ends,
        })
        .eq("id", line.id)
        .select("id")
    )
  )
  for (const result of results) {
    if (result.error) throw fail("Sale", result.error)
  }
  return lines
}

/** Ends the products' sales now, as the admin: their regular price shows. */
export async function endSale(
  supabase: Supabase,
  { products }: EndSaleInput,
  fail: Fail
) {
  const { data, error } = await supabase
    .from("products")
    .update({
      sale_price_cents: null,
      sale_starts_at: null,
      sale_ends_at: null,
    })
    .in(
      "id",
      products.map((product) => product.id)
    )
    .select("id")
  if (error) throw fail("Sale", error)
  return data.length
}
