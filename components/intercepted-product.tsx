import type { Metadata } from "next"
import { Suspense } from "react"
import { getProduct } from "@/lib/catalog-data"
import { pageMetadata, productDescription } from "@/lib/seo"

// A product URL opened from a product list (the shop, the Sales page): the
// list stays mounted and draws the details dialog itself, following the URL,
// so the intercepting route renders nothing. Loading the URL directly, or
// refreshing it, renders app/products/[slug].

type Props = { params: Promise<{ slug: string }> }

/** The tab title follows the open product. */
export async function interceptedProductMetadata({
  params,
}: Props): Promise<Metadata> {
  const product = await getProduct((await params).slug)
  return product
    ? pageMetadata({
        title: product.name,
        description: productDescription(product),
        path: `/products/${product.slug}`,
        image: product.images[0],
      })
    : {}
}

export function InterceptedProduct({ params }: Props) {
  return (
    <Suspense>
      <UrlDependent params={params} />
    </Suspense>
  )
}

// Marks the route as depending on the URL, as its metadata does, so it isn't
// treated as fully static.
async function UrlDependent({ params }: Props) {
  await params
  return null
}
