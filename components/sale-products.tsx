"use client"

import { useState } from "react"
import type { Product } from "@/lib/catalog"
import { ProductCatalog } from "./product-catalog"
import styles from "./sale-products.module.css"

type Option = { slug: string; name: string }

const byName = new Intl.Collator("en", { numeric: true, sensitivity: "base" })

/** The distinct options among the products, A–Z. */
function optionsOf(list: (Option | null)[]) {
  const seen = new Map<string, Option>()
  for (const item of list) if (item) seen.set(item.slug, item)
  return [...seen.values()].sort((a, b) => byName.compare(a.name, b.name))
}

/** A row of toggle pills: All, then each option. */
function Filter({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Option[]
  value: string | null
  onChange: (slug: string | null) => void
}) {
  return (
    <div className={styles.filter} role="group" aria-label={label}>
      {[{ slug: null, name: "All" }, ...options].map((option) => (
        <button
          key={option.slug ?? ""}
          type="button"
          className={styles.chip}
          aria-pressed={value === option.slug}
          onClick={() => onChange(option.slug)}
        >
          {option.name}
        </button>
      ))}
    </div>
  )
}

/**
 * The products on sale, narrowed by category and then brand when there's a
 * choice to make. Brands follow the chosen category, so a pick never leaves
 * the list empty.
 */
export function SaleProducts({ products }: { products: Product[] }) {
  const [category, setCategory] = useState<string | null>(null)
  const [brand, setBrand] = useState<string | null>(null)
  const categories = optionsOf(products.map((product) => product.category))
  const inCategory = category
    ? products.filter((product) => product.category.slug === category)
    : products
  const brands = optionsOf(inCategory.map((product) => product.brand))
  const chosenBrand = brands.some((item) => item.slug === brand) ? brand : null
  const shown = chosenBrand
    ? inCategory.filter((product) => product.brand?.slug === chosenBrand)
    : inCategory
  return (
    <>
      {(categories.length > 1 || brands.length > 1) && (
        <div className={styles.filters}>
          {categories.length > 1 && (
            <Filter
              label="Category"
              options={categories}
              value={category}
              onChange={setCategory}
            />
          )}
          {brands.length > 1 && (
            <Filter
              label="Brand"
              options={brands}
              value={chosenBrand}
              onChange={setBrand}
            />
          )}
        </div>
      )}
      <ProductCatalog products={shown} />
    </>
  )
}
