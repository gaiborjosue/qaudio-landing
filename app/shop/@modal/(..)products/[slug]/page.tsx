import type { Metadata } from "next"
import { Suspense } from "react"
import { getProduct } from "@/lib/catalog-data"

type Props = { params: Promise<{ slug: string }> }

// The tab title follows the open product.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).slug)
  return product ? { title: product.name } : {}
}

// Intercepts /products/<slug> when it's opened from a shop list, so the list
// stays mounted instead of navigating to the full product page. The list
// already has the product and draws the details dialog itself (with the
// card-to-dialog morph), following the URL, so this slot renders nothing.
// Loading the URL directly, or refreshing it, renders app/products/[slug].
export default function InterceptedProduct({ params }: Props) {
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
