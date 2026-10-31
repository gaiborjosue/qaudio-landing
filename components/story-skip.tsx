"use client"

import type { MouseEventHandler } from "react"
import { ArrowDown } from "lucide-react"
import { LiquidGlass } from "@/components/ui/liquid-glass"

export function StorySkip({
  onSkip,
}: {
  onSkip: MouseEventHandler<HTMLAnchorElement>
}) {
  return (
    <div className="story-skip">
      <LiquidGlass
        className="glass-action story-skip-glass"
        radius={26}
        scale={70}
        aberration={0}
        bevelDepth={22}
        frost={3}
        tint={0.3}
        onPointerMove={(event) => {
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
        }}
      >
        <span className="story-skip-aurora" aria-hidden="true" />
        <a className="glass-action-content" href="#categories" onClick={onSkip}>
          <span>Skip Story</span>
          <span className="glass-action-icon" aria-hidden="true">
            <ArrowDown size={17} strokeWidth={1.5} />
          </span>
        </a>
      </LiquidGlass>
    </div>
  )
}
