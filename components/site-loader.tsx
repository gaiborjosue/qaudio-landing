"use client"

import { useEffect, useRef, useState } from "react"
import {
  LiquidGlassLogo,
  type LiquidGlassLogoHandle,
} from "@/components/liquid-glass-logo"
import { liquidGlassLogoFinishTime } from "@/components/liquid-glass-logo-renderer"
import { loaderNeedsMinimum, LOADER_SHOWN_KEY } from "@/lib/loader-timing"

type Phase = "loading" | "finishing" | "leaving" | "done"

// The finished logo rests briefly before the overlay fades.
const HOLD_MS = 450
// Matches the .site-loader opacity transition in app/globals.css.
const FADE_MS = 600
// Leave anyway if the glass never reaches its finished frame.
const FINISH_LIMIT_MS = 6000

/**
 * Initial-load overlay: the ReactDrops liquid glass logo loops its
 * sphere-to-tile entrance on white until the page has loaded, lets the current
 * pass land on the plain logo in its original black, then fades out. It is
 * server-rendered, so the white overlay covers the page before hydration.
 * Repeat appearances within 60 seconds skip the entrance, hold, and fade
 * once the page and fonts are ready; session storage survives full-page loads.
 */
export function SiteLoader() {
  const [phase, setPhase] = useState<Phase>("loading")
  const logo = useRef<LiquidGlassLogoHandle>(null)
  const finishEntrance = useRef<boolean | null>(null)

  useEffect(() => {
    // Keep this mount's decision through Strict Mode's effect replay.
    if (finishEntrance.current === null) {
      const now = Date.now()
      let lastShown: number | null = null
      try {
        const saved = window.sessionStorage.getItem(LOADER_SHOWN_KEY)
        lastShown = saved === null ? null : Number(saved)
        window.sessionStorage.setItem(LOADER_SHOWN_KEY, String(now))
      } catch {
        console.warn("Couldn’t remember the site loader display time.")
      }
      finishEntrance.current = loaderNeedsMinimum(lastShown, now)
    }
    let cancelled = false
    let onLoad: (() => void) | undefined
    const windowLoaded =
      document.readyState === "complete"
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            onLoad = resolve
            window.addEventListener("load", onLoad, { once: true })
          })
    void Promise.all([windowLoaded, document.fonts?.ready]).then(() => {
      if (!cancelled) setPhase(finishEntrance.current ? "finishing" : "done")
    })
    return () => {
      cancelled = true
      if (onLoad) window.removeEventListener("load", onLoad)
    }
  }, [])

  // With looping off, wait for the logo to land (at least one full entrance).
  useEffect(() => {
    if (phase !== "finishing") return
    const started = performance.now()
    let frame = 0
    let timer = 0
    const check = () => {
      const landed =
        (logo.current?.time() ?? Infinity) >= liquidGlassLogoFinishTime
      if (landed || performance.now() - started > FINISH_LIMIT_MS) {
        timer = window.setTimeout(() => setPhase("leaving"), HOLD_MS)
      } else frame = requestAnimationFrame(check)
    }
    frame = requestAnimationFrame(check)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== "leaving") return
    const timer = window.setTimeout(() => setPhase("done"), FADE_MS)
    return () => clearTimeout(timer)
  }, [phase])

  return (
    <>
      <div className="site-loader" data-state={phase} aria-hidden="true">
        {phase === "done" ? null : (
          <LiquidGlassLogo
            ref={logo}
            logo="/loader-logo.svg"
            ending="logo"
            theme="light"
            logoColor="original"
            background="#ffffff"
            loop={phase === "loading"}
            aria-label="Q Audio"
            style={{ height: 480, maxHeight: "100svh" }}
          />
        )}
      </div>
      <noscript>
        <style>
          {
            ".site-loader{display:none!important}html{overflow:visible!important}"
          }
        </style>
      </noscript>
    </>
  )
}
