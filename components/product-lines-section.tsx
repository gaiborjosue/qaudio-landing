"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import DriftWall from "@/components/DriftWall"
import { Search } from "@/components/ui/search"
import type { CatalogBrand } from "@/lib/catalog"

// "Pro Ject", "pro-ject" and "PRO–JECT" all find Pro-Ject, and "kl" finds
// Klipsch and KLH. Accents and punctuation don't count.
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")

export function ProductLinesSection({ brands }: { brands: CatalogBrand[] }) {
  const wallRef = useRef<HTMLDivElement>(null)
  const tiles = useMemo(
    () =>
      brands.map((brand) => ({
        image: brand.logo_path,
        title: brand.name,
        href: `/shop?brand=${brand.slug}`,
      })),
    [brands]
  )
  const [query, setQuery] = useState("")
  // Set once the visitor has searched, so the wall fades between its two
  // arrangements without fading in on a plain page load.
  const [searched, setSearched] = useState(false)
  // Reduced motion shows an auto-height grid, which shrinks with the results
  // and would move the search field while the visitor types into it. Its
  // height is held at what it was before the first keystroke.
  const [held, setHeld] = useState<number | null>(null)
  const [layout, setLayout] = useState({
    columns: 4,
    tileWidth: 180,
    tileHeight: 132,
    gap: 18,
    turn: -14,
  })

  const needle = fold(query)
  const searching = needle !== ""
  const found = useMemo(
    () =>
      searching
        ? tiles.filter((tile) => fold(tile.title).includes(needle))
        : tiles,
    [tiles, needle, searching]
  )

  const search = (next: string) => {
    const wall = wallRef.current
    setQuery(next)
    if (fold(next) === "") {
      setHeld(null)
      return
    }
    setSearched(true)
    if (!searching && wall?.querySelector(".drift-wall--reduced")) {
      setHeld(wall.offsetHeight)
    }
  }

  useEffect(() => {
    const wall = wallRef.current
    if (!wall) return
    const mobile = window.matchMedia("(max-width: 600px)")
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width
      const columns = width < 500 ? 3 : width < 850 ? 4 : 5
      const gap = width < 500 ? 12 : 18
      setLayout({
        columns,
        tileWidth: Math.max(
          96,
          Math.min(200, Math.floor(width / columns / 1.08) - gap)
        ),
        tileHeight: width < 500 ? 100 : 132,
        gap,
        // A side-on turn shifts the wall off-center on narrow screens.
        turn: mobile.matches ? 0 : -14,
      })
    })
    observer.observe(wall)
    return () => observer.disconnect()
  }, [])

  return (
    <section
      className="product-lines-section"
      id="product-lines"
      aria-labelledby="product-lines-title"
    >
      <div className="product-lines-intro">
        <h2 id="product-lines-title">What Brand Are You Looking For?</h2>
        <div className="product-lines-search" role="search">
          <Search label="Search brands" onQueryChange={search} />
        </div>
        <p className="sr-only" role="status">
          {searching
            ? found.length
              ? `${found.length} ${found.length === 1 ? "brand" : "brands"} shown`
              : "No brands found"
            : ""}
        </p>
      </div>
      <div
        className="product-lines-wall"
        ref={wallRef}
        data-searched={searched || undefined}
        data-held={held !== null || undefined}
        style={held ? { minHeight: held } : undefined}
      >
        {found.length ? (
          <DriftWall
            key={searching ? "found" : "drifting"}
            items={found}
            {...layout}
            still={searching}
            grayscale
            pauseOnHover
            overlayColor="#000000"
            dim={0.8}
          />
        ) : (
          <p className="product-lines-empty" aria-hidden="true">
            No brands found
          </p>
        )}
      </div>
    </section>
  )
}
