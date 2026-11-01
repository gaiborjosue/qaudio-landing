import type { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ProductCatalog } from "@/components/product-catalog"
import { UsedEquipmentPromise } from "@/components/used-equipment-promise"
import { getCatalogTaxonomy, getProducts } from "@/lib/catalog-data"
import styles from "@/components/product-catalog.module.css"

export async function generateStaticParams() {
  const { categories } = await getCatalogTaxonomy()
  return categories.map(({ slug }) => ({ category: slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>
}): Promise<Metadata> {
  const { category: slug } = await params
  const { categories } = await getCatalogTaxonomy()
  const category = categories.find((item) => item.slug === slug)
  // Unknown slugs show the not-found page (streamed, so it can't set the
  // title itself).
  return { title: category ? category.name : "Page not found" }
}

export default function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  return (
    <main id="shop-content" className={styles.page}>
      <Suspense>
        <CategoryListing params={params} />
      </Suspense>
    </main>
  )
}

// The category comes from the URL, so it streams in from the cache inside
// Suspense while the shared App Shell prefetches.
async function CategoryListing({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category: slug } = await params
  const { categories } = await getCatalogTaxonomy()
  const category = categories.find((item) => item.slug === slug)
  if (!category) notFound()
  const products = await getProducts(category.slug)
  return (
    <>
      <div className={styles.heading}>
        <Image
          className={styles.categoryArt}
          src={category.artwork_path}
          alt=""
          width={160}
          height={160}
          loading="eager"
        />
        <h1>{category.name}</h1>
      </div>
      {category.slug === "used-equipment" && <UsedEquipmentPromise />}
      <ProductCatalog products={products} />
    </>
  )
}
