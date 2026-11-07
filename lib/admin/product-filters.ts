/** Shared by metadata links and the mounted Products tab. */
export type ProductFilters = {
  search: string
  category: string
  brand: string
  condition: string
  status: string
}

export const NO_PRODUCT_FILTERS: ProductFilters = {
  search: "",
  category: "",
  brand: "",
  condition: "",
  status: "",
}

export function productFiltersFromQuery(query: {
  get: (key: string) => string | null
}): ProductFilters {
  return Object.fromEntries(
    Object.keys(NO_PRODUCT_FILTERS).map((key) => [key, query.get(key) ?? ""])
  ) as ProductFilters
}

export function productFiltersHref(filters: ProductFilters) {
  const query = new URLSearchParams()
  for (const key of Object.keys(
    NO_PRODUCT_FILTERS
  ) as (keyof ProductFilters)[]) {
    if (filters[key]) query.set(key, filters[key])
  }
  return `/admin/products${query.size ? `?${query}` : ""}`
}
