import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ContactButton } from "@/components/contact-button"
import { CATEGORIES } from "@/lib/categories"

export function generateStaticParams() {
  return CATEGORIES.map(({ slug }) => ({ category: slug }))
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category: slug } = await params
  const category = CATEGORIES.find((item) => item.slug === slug)
  if (!category) notFound()

  return (
    <main className="category-destination">
      <header className="category-destination-header">
        <Link className="brand" href="/" aria-label="Q Audio home">
          <Image src="/qaudio-logo.svg" alt="Q Audio" width={47} height={57} />
        </Link>
        <Link className="category-back" href="/#categories">
          ← All categories
        </Link>
      </header>
      <div className="category-destination-content">
        <Image
          src={`/categories/${category.icon}`}
          alt=""
          width={300}
          height={300}
        />
        <p className="category-kicker">The collection</p>
        <h1>{category.name}</h1>
        <p>
          Our online collection is coming soon. Get in touch to explore what’s
          available in store.
        </p>
        <ContactButton />
      </div>
    </main>
  )
}
