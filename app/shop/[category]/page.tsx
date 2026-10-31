import type { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"
import { ProductCatalog } from "@/components/product-catalog"
import { getCatalogTaxonomy, getProducts } from "@/lib/catalog-data"
import styles from "@/components/product-catalog.module.css"

export const revalidate = 300

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
  return { title: `${category?.name ?? "Not found"} — Q Audio` }
}

export default async function CategoryPage({
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
    <main id="shop-content" className={styles.page}>
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
      <ProductCatalog products={products} />
    </main>
  )
}
