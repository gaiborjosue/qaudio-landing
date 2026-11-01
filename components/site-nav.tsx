"use client"

import {
  Suspense,
  type CSSProperties,
  type ElementType,
  type ReactElement,
} from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import PillNavBase from "@/components/PillNav"

// PillNav is plain JS, so its inferred props are unusable (props without
// defaults, like the omitted `logo`, become required); type what we use.
type PillNavProps = {
  items: { label: string; href: string }[]
  activeHref?: string
  linkComponent?: ElementType
  theme?: "dark" | "light"
  size?: "sm" | "md" | "lg"
  surface?: "glass" | "solid" | "none"
  style?: CSSProperties
}
const PillNav = PillNavBase as unknown as (props: PillNavProps) => ReactElement

const PAGES = [
  { label: "Home", href: "/" },
  { label: "News", href: "/news" },
  { label: "QDeal", href: "/qdeal" },
  { label: "Used Equipment", href: "/shop/used-equipment" },
]

// PillNav's glass with more frost: a heavier blur, a lighter white haze, and
// less saturation so colorful sections behind stay neutral.
const FROSTED_GLASS = {
  "--pn-blur": "blur(30px) saturate(1.2)",
  "--pn-surface": "rgb(255 255 255 / 0.55)",
} as CSSProperties

/**
 * Main menu: React Bits PillNav without its logo (the header shows ours),
 * fixed to the top right so it stays in reach while scrolling.
 */
export function SiteNav() {
  // The current path is unknown while prerendering a shared shell (dynamic
  // routes, intercepted product URLs), so the menu first renders without an
  // active item and the highlighted one streams in.
  return (
    <Suspense fallback={<SiteNavFrame />}>
      <CurrentSiteNav />
    </Suspense>
  )
}

function CurrentSiteNav() {
  const pathname = usePathname()
  // Pages below a section (e.g. /news/<post>) keep that section highlighted.
  const activeHref =
    PAGES.find(({ href }) => href !== "/" && pathname.startsWith(`${href}/`))
      ?.href ?? pathname
  return <SiteNavFrame activeHref={activeHref} />
}

function SiteNavFrame({ activeHref }: { activeHref?: string }) {
  return (
    <div className="site-nav">
      <PillNav
        items={PAGES}
        activeHref={activeHref}
        linkComponent={Link}
        theme="light"
        size="lg"
        surface="glass"
        style={FROSTED_GLASS}
      />
    </div>
  )
}
