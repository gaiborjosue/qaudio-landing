"use client"

import { useEffect, useRef, useState } from "react"
import DriftWall from "@/components/DriftWall"
import { BRAND_TILES } from "@/lib/brands"

export function ProductLinesSection() {
  const wallRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({
    columns: 4,
    tileWidth: 180,
    tileHeight: 132,
    gap: 18,
    turn: -14,
  })

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
      </div>
      <div className="product-lines-wall" ref={wallRef}>
        <DriftWall
          items={BRAND_TILES}
          {...layout}
          grayscale
          pauseOnHover
          overlayColor="#000000"
          dim={0.8}
        />
      </div>
    </section>
  )
}
