"use client"

import { useEffect, useRef, useState } from "react"
import {
  LiquidGlassLogo,
  type LiquidGlassLogoHandle,
} from "@/components/liquid-glass-logo"
import { liquidGlassLogoFinishTime } from "@/components/liquid-glass-logo-renderer"

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
 */
export function SiteLoader() {
  const [phase, setPhase] = useState<Phase>("loading")
  const logo = useRef<LiquidGlassLogoHandle>(null)

  useEffect(() => {
    let cancelled = false
    const windowLoaded =
      document.readyState === "complete"
        ? Promise.resolve()
        : new Promise<void>((resolve) =>
            window.addEventListener("load", () => resolve(), { once: true })
          )
    void Promise.all([windowLoaded, document.fonts?.ready]).then(() => {
      if (!cancelled) setPhase("finishing")
    })
    return () => {
      cancelled = true
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
