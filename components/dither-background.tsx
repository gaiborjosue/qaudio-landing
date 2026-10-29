"use client"

import { useEffect, useRef, useState } from "react"

// Dependency-free halftone waves inspired by React Bits' Dither.
function hash(value: number) {
  const result = Math.sin(value * 127.1 + 311.7) * 43758.5453
  return result - Math.floor(result)
}

function noise(value: number) {
  const integer = Math.floor(value)
  const fraction = value - integer
  const blend = fraction * fraction * (3 - 2 * fraction)
  return hash(integer) * (1 - blend) + hash(integer + 1) * blend
}

type Ripple = { x: number; y: number; startedAt: number }
const RIPPLE_DURATION = 1.8

// Keep the upper arch circular, then ease its feet outward into the flat edge.
function createArchMask(
  width: number,
  height: number,
  centerY: number,
  radius: number
) {
  const centerX = width / 2
  const halfWidthAt = (y: number) =>
    Math.sqrt(Math.max(0, radius ** 2 - (y - centerY) ** 2))
  const joinY = Math.max(
    centerY - radius + 1,
    Math.min(centerY - 1, height - Math.min(64, radius * 0.22))
  )
  const joinHalfWidth = halfWidthAt(joinY)
  const bottomHalfWidth = halfWidthAt(height)
  const flare = Math.min(
    42,
    width * 0.045,
    Math.max(0, centerX - bottomHalfWidth - 3)
  )
  const footHalfWidth = Math.max(bottomHalfWidth + flare, joinHalfWidth + 4)
  const controlLength = Math.min(40, radius * 0.15)
  const tangentX = ((centerY - joinY) / radius) * controlLength
  const tangentY = (joinHalfWidth / radius) * controlLength
  const handle = (footHalfWidth - joinHalfWidth) * 0.45
  const rightJoin = centerX + joinHalfWidth
  const leftJoin = centerX - joinHalfWidth
  const rightFoot = centerX + footHalfWidth
  const leftFoot = centerX - footHalfWidth
  const boundary = `M${width} ${height} H${rightFoot}
    C${rightFoot - handle} ${height} ${rightJoin + tangentX} ${joinY + tangentY} ${rightJoin} ${joinY}
    A${radius} ${radius} 0 0 0 ${leftJoin} ${joinY}
    C${leftJoin - tangentX} ${joinY + tangentY} ${leftFoot + handle} ${height} ${leftFoot} ${height}
    H0`
  const path = `M0 0 H${width} V${height} ${boundary.slice(boundary.indexOf("H"))} Z`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path fill="white" d="${path}"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

export function DitherBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  const phaseRef = useRef(0)
  const ripplesRef = useRef<Ripple[]>([])

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReducedMotion(preference.matches)
    sync()
    preference.addEventListener("change", sync)
    return () => preference.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d", { alpha: true })
    if (!context) return

    let width = 0
    let height = 0
    let frame = 0
    let previousTime = 0
    let visible = true
    let disposed = false
    const staticMotion =
      reducedMotion ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    function draw() {
      if (!context) return
      context.clearRect(0, 0, width, height)
      const spacing = width < 600 ? 5 : 5.5
      const time = phaseRef.current
      const columns = Math.ceil(width / spacing)
      const rows = Math.ceil(height / spacing)
      ripplesRef.current = ripplesRef.current.filter(
        (ripple) => time - ripple.startedAt < RIPPLE_DURATION
      )
      const ripples = ripplesRef.current.map((ripple) => {
        const progress = (time - ripple.startedAt) / RIPPLE_DURATION
        return {
          x: ripple.x * width,
          y: ripple.y * height,
          radius: progress * Math.hypot(width, height) * 0.65,
          strength: Math.pow(1 - progress, 1.5),
        }
      })

      for (let col = 0; col < columns; col++) {
        const x = col * spacing
        const position = x / width
        const edge = Math.pow(Math.abs(position - 0.5) * 2, 0.72)
        const bar = Math.floor(col / 4)
        const wave = noise(bar * 0.83 + time * 0.25)
        const detail = noise(bar * 1.91 - time * 0.16)
        const amplitude = 0.42 + edge * 0.54
        const barHeight =
          height * amplitude * (0.45 + wave * 0.7 + detail * 0.24)

        for (let row = 0; row < rows; row++) {
          const y = row * spacing
          const depth = (y - (height - barHeight)) / barHeight
          let rippleStrength = 0
          let offsetX = 0
          let offsetY = 0
          for (const ripple of ripples) {
            const dx = x - ripple.x
            const dy = y - ripple.y
            const distance = Math.hypot(dx, dy)
            const ring = (distance - ripple.radius) / 25
            const strength = Math.exp(-ring * ring) * ripple.strength
            rippleStrength += strength
            if (distance > 0) {
              offsetX += (dx / distance) * strength * 16
              offsetY += (dy / distance) * strength * 16
            }
          }
          if (depth < -0.24 && rippleStrength < 0.02) continue
          const grain = hash(col + row * 719)
          const drift = Math.sin(row * 0.13 + col * 0.07 - time * 0.6) * 0.11
          const density = Math.min(
            1,
            Math.max(0, depth * 2.8 + drift + 0.09) + rippleStrength * 0.85
          )
          if (grain > density) continue
          const cloud = noise(col * 0.09 + row * 0.045 + time * 0.2)
          const opacity =
            (0.18 + Math.max(0, depth) * 0.32) * (0.6 + cloud * 0.4) +
            rippleStrength * 0.4
          const dot = (1.3 + grain * 0.7) * (1 + rippleStrength * 0.3)
          context.fillStyle = `rgba(0,0,0,${Math.min(0.85, opacity).toFixed(3)})`
          context.fillRect(x + offsetX, y + offsetY, dot, dot)
        }
      }
    }

    function tick(now: number) {
      if (disposed || staticMotion || !visible || document.hidden) return
      if (now - previousTime >= 1000 / 24) {
        phaseRef.current += Math.min((now - previousTime) / 1000, 0.06)
        previousTime = now
        draw()
      }
      frame = requestAnimationFrame(tick)
    }

    function start() {
      cancelAnimationFrame(frame)
      previousTime = performance.now()
      if (!staticMotion && visible && !document.hidden)
        frame = requestAnimationFrame(tick)
    }

    const hero = canvas.closest(".hero")
    function onPointerDown(event: Event) {
      if (
        !canvas ||
        staticMotion ||
        !(event instanceof PointerEvent) ||
        event.button !== 0
      )
        return
      if (
        event.target instanceof Element &&
        event.target.closest("a, button, dialog, .vinyl-surround")
      )
        return
      const bounds = canvas.getBoundingClientRect()
      ripplesRef.current = [
        ...ripplesRef.current.slice(-3),
        {
          x: (event.clientX - bounds.left) / bounds.width,
          y: (event.clientY - bounds.top) / bounds.height,
          startedAt: phaseRef.current,
        },
      ]
    }

    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width
      height = entry.contentRect.height
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const surface = surfaceRef.current
      const surround = hero?.querySelector(".vinyl-anchor")
      if (surface && surround) {
        const surfaceBounds = surface.getBoundingClientRect()
        const vinylBounds = surround.getBoundingClientRect()
        const extraGap = Math.min(10, Math.max(6, width * 0.007))
        surface.style.setProperty(
          "--dither-mask",
          createArchMask(
            surfaceBounds.width,
            surfaceBounds.height,
            vinylBounds.top - surfaceBounds.top + vinylBounds.width / 2,
            vinylBounds.width / 2 + extraGap
          )
        )
      }
      draw()
      start()
    })
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      start()
    })
    resize.observe(canvas)
    intersection.observe(canvas)
    document.addEventListener("visibilitychange", start)
    hero?.addEventListener("pointerdown", onPointerDown)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      resize.disconnect()
      intersection.disconnect()
      document.removeEventListener("visibilitychange", start)
      hero?.removeEventListener("pointerdown", onPointerDown)
    }
  }, [reducedMotion])

  return (
    <>
      <div className="dither-shadow" aria-hidden="true">
        <div className="dither-surface" ref={surfaceRef}>
          <div className="dither-field">
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>
    </>
  )
}
