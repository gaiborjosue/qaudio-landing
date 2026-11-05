import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ProductPageView } from "@/components/product-catalog"
import { getProduct, getProductSlugs } from "@/lib/catalog-data"
import type { Product } from "@/lib/catalog"
import { storeClock } from "@/lib/store-hours"
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
  if (!product) return { title: "Page not found" }
  const image = product.images[0]
  return {
    title: product.name,
    description: product.short_description,
    openGraph: {
      title: product.name,
      description: product.short_description,
      images: image
        ? [{ url: image.src, width: image.width, height: image.height }]
        : [],
    },
  }
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: productJsonLd(product) }}
      />
    </>
  )
}

// schema.org Product data for search results. Escaping "<" keeps the JSON
// from closing the script element early.
function productJsonLd(product: Product) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.short_description,
    image: product.images.map((image) => image.src),
    brand: { "@type": "Brand", name: product.brand.name },
    category: product.category.name,
    offers: {
      "@type": "Offer",
      price: (product.price_cents / 100).toFixed(2),
      priceCurrency: "USD",
      // A sale price holds until its last day (store time).
      ...(product.sale && {
        priceValidUntil: storeClock(new Date(product.sale.ends_at)).date,
      }),
      itemCondition:
        product.condition === "New"
          ? "https://schema.org/NewCondition"
          : "https://schema.org/UsedCondition",
    },
  }).replace(/</g, "\\u003c")
}
