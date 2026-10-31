export type CatalogCategory = {
  slug: string
  name: string
  artwork_path: string
}

export type CatalogBrand = {
  slug: string
  name: string
  logo_path: string
}

export type ProductImage = {
  id: string
  src: string
  alt: string
  width: number
  height: number
}

export type Product = {
  id: string
  slug: string
  name: string
  short_description: string
  description_intro: string
  features: string[]
  description_closing: string
  price_cents: number
  msrp_cents: number | null
  price_unit: string
  condition: string
  ready_for_audition: boolean
  manufacturer_url: string | null
  category: CatalogCategory
  brand: CatalogBrand
  images: ProductImage[]
}

export const formatPrice = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
