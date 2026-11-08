import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ProductCatalog } from "@/components/product-catalog"
import { getCatalogTaxonomy, getProducts } from "@/lib/catalog-data"
import { StructuredData } from "@/components/structured-data"
import { breadcrumbs, pageMetadata } from "@/lib/seo"
import styles from "@/components/product-catalog.module.css"

type SearchParams = Promise<{ brand?: string | string[] }>

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams
}): Promise<Metadata> {
  const { brand: value } = await searchParams
  const slug = Array.isArray(value) ? value[0] : value
  const { brands } = await getCatalogTaxonomy()
  const brand = brands.find((item) => item.slug === slug)
  if (slug && !brand) notFound()
  return pageMetadata({
    title: brand ? `${brand.name} Hi-Fi` : "Shop",
    description: brand
      ? `Explore ${brand.name} at Q Audio in Cambridge, Massachusetts. Browse the collection and contact us for personal advice.`
      : "Explore new, demo, and used hi-fi equipment at Q Audio in Cambridge, Massachusetts. Browse turntables, speakers, amplifiers, and more.",
    path: brand ? `/shop?brand=${encodeURIComponent(brand.slug)}` : "/shop",
  })
}

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
      <StructuredData
        value={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Shop", path: "/shop" },
          ...(brand
            ? [
                {
                  name: brand.name,
                  path: `/shop?brand=${encodeURIComponent(brand.slug)}`,
                },
              ]
            : []),
        ])}
      />
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
