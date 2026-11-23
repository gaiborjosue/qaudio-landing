"use client"

import { SortableList } from "@/components/ui/sortable-list"
import type { AdminProduct, CatalogTaxonomy } from "@/lib/admin/preview"
import type { ReorderProductsInput } from "@/lib/admin/schemas"
import { formatPrice } from "@/lib/catalog"
import { ProductThumb } from "./product-review-table"
import styles from "./admin.module.css"

/** "Turntables", "Marantz", or "all products": what a reorder arranges. */
export function orderScope(
  { category_slug, brand_slug }: ReorderProductsInput,
  taxonomy: CatalogTaxonomy
) {
  if (category_slug) {
    return (
      taxonomy.categories.find((item) => item.slug === category_slug)?.name ??
      category_slug
    )
  }
  if (brand_slug) {
    return (
      taxonomy.brands.find((item) => item.slug === brand_slug)?.name ??
      brand_slug
    )
  }
  return "all products"
}

/**
 * A proposed product order the owner can rearrange by dragging (or with the
 * arrow keys on a row's grip), drafts included, since a reorder lists every
 * product in its set.
 */
export function ProductOrder({
  ids,
  products,
  onReorder,
}: {
  ids: string[]
  products: AdminProduct[]
  onReorder: (ids: string[]) => void
}) {
  const byId = new Map(products.map((product) => [product.id, product]))
  const rows = ids.flatMap((id) => byId.get(id) ?? [])

  return (
    <SortableList
      className={styles.order}
      aria-label="Product order"
      items={rows}
      onReorder={(next) => onReorder(next.map((product) => product.id))}
      itemLabel={(product) => product.name}
      renderItem={(product) => {
        return (
          <>
            <ProductThumb
              className={styles.orderPhoto}
              src={product.images[0]?.src}
            />
            <span className={styles.orderText}>
              <span className={styles.orderName}>{product.name}</span>
              <span className={styles.orderMeta}>
                {[
                  product.brand?.name ?? "",
                  formatPrice(product.price_cents),
                  product.status !== "published" && "Draft",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </>
        )
      }}
    />
  )
}
