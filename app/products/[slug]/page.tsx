import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ProductPageView } from "@/components/product-catalog"
import { getProduct, getProductSlugs } from "@/lib/catalog-data"
import { StructuredData } from "@/components/structured-data"
import {
  breadcrumbs,
  pageMetadata,
  productDescription,
  productStructuredData,
} from "@/lib/seo"
import styles from "@/components/product-catalog.module.css"

type Props = { params: Promise<{ slug: string }> }

// Published products are prerendered; newer ones render on first visit.
export async function generateStaticParams() {
  const slugs = await getProductSlugs()
  // Cache Components needs at least one param to build the route; a slug
  // that matches no product renders the not-found page.
  return (slugs.length ? slugs : ["none"]).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).slug)
  if (!product) notFound()
  return pageMetadata({
    title: product.name,
    description: productDescription(product),
    path: `/products/${product.slug}`,
    image: product.images[0],
  })
}

// The App Shell (header and menu) is shared by every product, so the
// product itself streams in from the cache inside Suspense.
export default function ProductPage({ params }: Props) {
  return (
    <main id="product-content" className={styles.page}>
      <Suspense>
        <ProductContent params={params} />
      </Suspense>
    </main>
  )
}

async function ProductContent({ params }: Props) {
  const product = await getProduct((await params).slug)
  if (!product) notFound()
  return (
    <>
      <Link className={styles.back} href={`/shop/${product.category.slug}`}>
        <span aria-hidden="true">←</span>
        <Image
          src={product.category.artwork_path}
          alt=""
          width={60}
          height={60}
        />
        {product.category.name}
      </Link>
      <ProductPageView product={product} />
      <StructuredData value={productStructuredData(product)} />
      <StructuredData
        value={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Shop", path: "/shop" },
          {
            name: product.category.name,
            path: `/shop/${product.category.slug}`,
          },
          { name: product.name, path: `/products/${product.slug}` },
        ])}
      />
    </>
  )
}
