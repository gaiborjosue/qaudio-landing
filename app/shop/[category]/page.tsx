import type { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ProductCatalog } from "@/components/product-catalog"
import { UsedEquipmentPromise } from "@/components/used-equipment-promise"
import { getCatalogTaxonomy, getProducts } from "@/lib/catalog-data"
import { StructuredData } from "@/components/structured-data"
import { breadcrumbs, pageMetadata } from "@/lib/seo"
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
  if (!category) notFound()
  return pageMetadata({
    title: category.name,
    description: `Explore ${category.name.toLowerCase()} at Q Audio, an independent hi-fi store in Cambridge, Massachusetts. Call or visit for personal advice.`,
    path: `/shop/${category.slug}`,
  })
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
      <StructuredData
        value={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Shop", path: "/shop" },
          { name: category.name, path: `/shop/${category.slug}` },
        ])}
      />
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
