import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ContactButton } from "@/components/contact-button"
import { BRANDS } from "@/lib/brands"

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string | string[] }>
}) {
  const { brand: value } = await searchParams
  const slug = Array.isArray(value) ? value[0] : value
  const brand = BRANDS.find((item) => item.slug === slug)
  if (slug && !brand) notFound()

  return (
    <main className="category-destination">
      <header className="category-destination-header">
        <Link className="brand" href="/" aria-label="Q Audio home">
          <Image src="/qaudio-logo.svg" alt="Q Audio" width={47} height={57} />
        </Link>
        <Link className="category-back" href="/#product-lines">
          ← All product lines
        </Link>
      </header>
      <div className="category-destination-content brand-destination-content">
        {brand && (
          <div className="brand-destination-logo">
            <Image src={brand.logo} alt={brand.name} width={300} height={180} />
          </div>
        )}
        <p className="category-kicker">The collection</p>
        <h1 className={brand ? "sr-only" : undefined}>
          {brand ? brand.name : "Find your sound."}
        </h1>
        {brand && (
          <Link
            className="brand-filter"
            href="/shop"
            aria-label={`Clear ${brand.name} brand filter`}
          >
            <span>Brand: {brand.name}</span>
            <span aria-hidden="true">×</span>
          </Link>
        )}
        <p>
          Our online collection is coming soon. Get in touch to explore what’s
          available in store.
        </p>
        <ContactButton />
      </div>
    </main>
  )
}
