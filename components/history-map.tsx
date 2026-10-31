"use client"

import { useEffect, useRef, useState } from "react"
import WorldMap from "@/components/ui/world-map"

const CAMBRIDGE = { lat: 42.3736, lng: -71.1097 }

// The collectors' markets the late-'70s exports served, in the order the
// history names them: Japan, Asia (Hong Kong) and Europe (Frankfurt).
const ROUTES = [
  { start: CAMBRIDGE, end: { lat: 35.6762, lng: 139.6503 } },
  { start: CAMBRIDGE, end: { lat: 22.3193, lng: 114.1694 } },
  { start: CAMBRIDGE, end: { lat: 50.1109, lng: 8.6821 } },
]

/**
 * Aceternity world map for the exports chapter. The routes redraw each time
 * the scroll story makes this slide active (its `data-active` attribute).
 */
export function HistoryMap() {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const slide = ref.current?.closest(".history-slide")
    if (!slide) return
    const observer = new MutationObserver(() =>
      setActive(slide.hasAttribute("data-active"))
    )
    observer.observe(slide, {
      attributes: true,
      attributeFilter: ["data-active"],
    })
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="history-map">
      <WorldMap dots={ROUTES} lineColor="#111" play={active} />
    </div>
  )
}
