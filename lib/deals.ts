// The two kinds of deal and the page each is shown on. QDeals are Q Audio-only
// opportunities; featured sales are promotions shown above the products on
// sale. Pure, so the site and the admin share it.

export const DEAL_KINDS = ["qdeal", "sale"] as const
export type DealKind = (typeof DEAL_KINDS)[number]

export const DEAL_PAGES: Record<DealKind, string> = {
  qdeal: "/qdeal",
  sale: "/sales",
}

export const DEAL_KIND_LABELS: Record<DealKind, string> = {
  qdeal: "QDeal",
  sale: "Featured sale",
}

/** A deal row's optional condition pill. */
export const DEAL_CONDITIONS = ["new", "demo", "used"] as const
export type DealCondition = (typeof DEAL_CONDITIONS)[number]

export const DEAL_CONDITION_LABELS: Record<DealCondition, string> = {
  new: "New",
  demo: "Demo",
  used: "Used",
}

export const isDealCondition = (value: unknown): value is DealCondition =>
  DEAL_CONDITIONS.includes(value as DealCondition)
