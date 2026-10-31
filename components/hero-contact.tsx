"use client"

import type { PointerEvent } from "react"
import { MessageCircle } from "lucide-react"
import { LiquidGlass } from "@/components/ui/liquid-glass"

// Jump instantly so smooth scrolling doesn't fast-forward the pinned story.
function jumpToContact() {
  const root = document.documentElement
  root.style.scrollBehavior = "auto"
  requestAnimationFrame(() => root.style.removeProperty("scroll-behavior"))
}

function trackGlassPointer(event: PointerEvent<HTMLDivElement>) {
  if (event.pointerType !== "mouse") return
  const bounds = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty(
    "--glass-x",
    `${((event.clientX - bounds.left) / bounds.width) * 100}%`
  )
  event.currentTarget.style.setProperty(
    "--glass-y",
    `${((event.clientY - bounds.top) / bounds.height) * 100}%`
  )
}

export function HeroContact() {
  return (
    <LiquidGlass
      className="hero-contact"
      scale={70}
      aberration={0}
      bevelDepth={22}
      frost={6}
      tint={0.45}
      onPointerMove={trackGlassPointer}
    >
      <a href="#contact" onClick={jumpToContact}>
        Contact us
        <span className="hero-contact-icon" aria-hidden="true">
          <MessageCircle size={17} strokeWidth={1.5} />
        </span>
      </a>
    </LiquidGlass>
  )
}
