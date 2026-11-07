import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ProductCatalog } from "@/components/product-catalog"
import { getCatalogTaxonomy, getProducts } from "@/lib/catalog-data"
import styles from "@/components/product-catalog.module.css"

export const metadata: Metadata = { title: "Shop" }

type SearchParams = Promise<{ brand?: string | string[] }>

// The brand filter comes from the URL, so the listing renders per request
// (from cached data) inside Suspense while the shell around it prerenders.
export default function ShopPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  return (
    <main id="shop-content" className={styles.page}>
      <Suspense>
        <ShopListing searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function ShopListing({ searchParams }: { searchParams: SearchParams }) {
  const { brand: value } = await searchParams
  const slug = Array.isArray(value) ? value[0] : value
  const { brands } = await getCatalogTaxonomy()
  const brand = brands.find((item) => item.slug === slug)
  if (slug && !brand) notFound()
  const products = await getProducts(undefined, brand?.slug)
  return (
    <>
      <div className={styles.heading}>
        {brand?.logo_path ? (
          <Image
            className={styles.headingLogo}
            src={brand.logo_path}
            alt=""
            width={200}
            height={100}
            loading="eager"
          />
        ) : null}
        <h1>{brand ? brand.name : "The collection"}</h1>
      </div>
      {brand ? (
        <Link
          className={styles.filter}
          href="/shop"
          aria-label={`Clear ${brand.name} brand filter`}
        >
          Brand: {brand.name}
          <span aria-hidden="true">×</span>
        </Link>
      ) : null}
      <ProductCatalog products={products} />
    </>
  )
}
