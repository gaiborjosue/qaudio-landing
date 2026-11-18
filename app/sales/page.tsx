import type { Metadata } from "next"
import { DealCard } from "@/components/deal-card"
import { SaleProducts } from "@/components/sale-products"
import { SoundwaveHeading } from "@/components/soundwave-heading"
import { StructuredData } from "@/components/structured-data"
import { getProducts } from "@/lib/catalog-data"
import { getDeals } from "@/lib/deals-data"
import { breadcrumbs, pageMetadata } from "@/lib/seo"
import catalog from "@/components/product-catalog.module.css"
import styles from "./sales.module.css"

export const metadata: Metadata = pageMetadata({
  title: "Sales",
  path: "/sales",
  description:
    "Hi-fi on sale for a limited time at Q Audio in Cambridge, Massachusetts: current promotions and every product with a sale price.",
})

/**
 * Featured sale promotions, then every product with a live time-limited
 * sale, in the shop's order. Both come from the cache; a sale shows and
 * ends within its refresh, as on the shop's pages.
 */
export default async function SalesPage() {
  const [featured, products] = await Promise.all([
    getDeals("sale"),
    getProducts(),
  ])
  const onSale = products.filter((product) => product.sale)
  return (
    <main id="sales-content" className={catalog.page}>
      <StructuredData
        value={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Sales", path: "/sales" },
        ])}
      />
      <SoundwaveHeading className={catalog.heading}>
        <h1>Sales</h1>
      </SoundwaveHeading>
      {featured.length > 0 && (
        <section
          className={styles.featured}
          aria-label="Featured sales"
          data-single={featured.length === 1 || undefined}
        >
          {featured.map((deal) => (
            <DealCard key={deal.id} deal={deal} showEnd />
          ))}
        </section>
      )}
      {onSale.length > 0 ? (
        <section aria-label="Products on sale">
          <SaleProducts products={onSale} />
        </section>
      ) : (
        <p className={catalog.empty}>No products on sale right now.</p>
      )}
    </main>
  )
}
