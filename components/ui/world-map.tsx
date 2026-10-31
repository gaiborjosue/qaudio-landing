"use client"

// Installed from @aceternity/world-map-demo (Aceternity UI World Map).
// Local changes:
// - The dotted world is a pre-rendered static SVG (`mapSrc`, made by
//   scripts/world-dots.mjs), so dotted-map and next-themes never ship to the
//   browser. The site is light-only.
// - Points use dotted-map's Mercator projection for its default world region,
//   so routes land on the right dots (the original projection assumed a
//   full-globe equirectangular map).
// - `play` draws the routes and pulses their ends; false hides the routes, so
//   they can redraw each time their slide becomes active.
// - Reduced motion shows the routes drawn, without pulsing.
// - The map is decorative (empty alt); the surrounding text tells the story.

import { motion, useReducedMotion } from "motion/react"

interface MapProps {
  dots?: Array<{
    start: { lat: number; lng: number; label?: string }
    end: { lat: number; lng: number; label?: string }
  }>
  lineColor?: string
  /** Draw the routes now; false hides them until the next play. */
  play?: boolean
  /** Static dotted world from scripts/world-dots.mjs (198×100 viewBox). */
  mapSrc?: string
}

// Must match scripts/world-dots.mjs: dotted-map's default world region
// (lat −56…71, lng −168…168) at height 100, i.e. a 198×100 map.
const MAP_WIDTH = 198
const MAP_HEIGHT = 100
const LNG_MIN = -168
const LNG_MAX = 168
// Ellipsoidal (WGS84) Mercator, as proj4's "+proj=merc +datum=WGS84".
const ECCENTRICITY = 0.0818191908426215
const mercatorY = (lat: number) => {
  const phi = (lat * Math.PI) / 180
  const sine = ECCENTRICITY * Math.sin(phi)
  return Math.log(
    Math.tan(Math.PI / 4 + phi / 2) *
      Math.pow((1 - sine) / (1 + sine), ECCENTRICITY / 2)
  )
}
const Y_MAX = mercatorY(71)
const Y_MIN = mercatorY(-56)
// The 198×100 map is letterboxed into the 800×400 overlay: 4 units per map
// unit, centered horizontally.
const SCALE = 400 / MAP_HEIGHT
const OFFSET_X = (800 - MAP_WIDTH * SCALE) / 2

export default function WorldMap({
  dots = [],
  lineColor = "#0ea5e9",
  play = true,
  mapSrc = "/story/world-dots.svg",
}: MapProps) {
  const reduced = useReducedMotion()
  const drawn = play || Boolean(reduced)
  const pulse = play && !reduced

  // Rounded so server and browser engines (whose Math.log/tan differ in the
  // last digits) render identical paths and hydrate cleanly.
  const projectPoint = (lat: number, lng: number) => {
    const x = (MAP_WIDTH * (lng - LNG_MIN)) / (LNG_MAX - LNG_MIN)
    const y = (MAP_HEIGHT * (Y_MAX - mercatorY(lat))) / (Y_MAX - Y_MIN)
    const round = (value: number) => Math.round(value * 100) / 100
    return { x: round(OFFSET_X + x * SCALE), y: round(y * SCALE) }
  }

  const createCurvedPath = (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => {
    const midX = (start.x + end.x) / 2
    const midY = Math.min(start.y, end.y) - 50
    return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`
  }

  const endpoint = (point: { x: number; y: number }) => (
    <>
      <circle cx={point.x} cy={point.y} r="2" fill={lineColor} />
      <circle cx={point.x} cy={point.y} r="2" fill={lineColor} opacity="0">
        {pulse ? (
          <>
            <animate
              attributeName="r"
              from="2"
              to="8"
              dur="1.5s"
              begin="0s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              from="0.5"
              to="0"
              dur="1.5s"
              begin="0s"
              repeatCount="indefinite"
            />
          </>
        ) : null}
      </circle>
    </>
  )

  return (
    <div
      className="relative aspect-[2/1] w-full rounded-lg bg-white font-sans"
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
      <img
        src={mapSrc}
        className="pointer-events-none h-full w-full [mask-image:linear-gradient(to_bottom,transparent,white_10%,white_90%,transparent)] select-none"
        alt=""
        height="495"
        width="1056"
        draggable={false}
      />
      <svg
        viewBox="0 0 800 400"
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
      >
        {dots.map((dot, i) => {
          const startPoint = projectPoint(dot.start.lat, dot.start.lng)
          const endPoint = projectPoint(dot.end.lat, dot.end.lng)
          return (
            <g key={`path-group-${i}`}>
              <motion.path
                d={createCurvedPath(startPoint, endPoint)}
                fill="none"
                stroke="url(#path-gradient)"
                strokeWidth="1"
                initial={{ pathLength: drawn ? 1 : 0 }}
                animate={{ pathLength: drawn ? 1 : 0 }}
                transition={
                  pulse
                    ? { duration: 1, delay: 0.5 * i, ease: "easeOut" }
                    : { duration: 0 }
                }
              />
            </g>
          )
        })}

        <defs>
          <linearGradient id="path-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="5%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="95%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {dots.map((dot, i) => (
          <g key={`points-group-${i}`}>
            <g key={`start-${i}`}>
              {endpoint(projectPoint(dot.start.lat, dot.start.lng))}
            </g>
            <g key={`end-${i}`}>
              {endpoint(projectPoint(dot.end.lat, dot.end.lng))}
            </g>
          </g>
        ))}
      </svg>
    </div>
  )
}
