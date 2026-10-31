"use client"

import { useRef, type ReactNode } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { RecordPlayer } from "@/components/record-player"
import { readScrollPosition, rememberScrollPosition } from "@/lib/scroll-memory"

gsap.registerPlugin(useGSAP, ScrollTrigger)

const LINES = [
  ["HI-FI", "IS NOT"],
  ["ONLY ABOUT", "THE GEAR."],
  ["IT'S ABOUT", "FINDING"],
  ["WHAT WORKS", "FOR YOU."],
]

const REVEAL_START = 1.7
const REVEAL_DURATION = 0.75
const ROW_STAGGER = 0.32
const REVEAL_GROUPS = [0, 1, 2, 2] as const
const REVEAL_END =
  REVEAL_START + REVEAL_DURATION + ROW_STAGGER * Math.max(...REVEAL_GROUPS)
const LAST_ROW_START = REVEAL_END
const LAST_ROW_DURATION = 0.7
const FLIP_START = REVEAL_END + 0.18
const FLIP_DURATION = 2.15
const ALIGN_START = LAST_ROW_START + LAST_ROW_DURATION
const ALIGN_DURATION = 1.45
const GROW_START = FLIP_START + FLIP_DURATION * 0.68
const LAND_START = Math.max(
  FLIP_START + FLIP_DURATION,
  ALIGN_START + ALIGN_DURATION
)
const LAND_DURATION = 0.7
const ARM_START = LAND_START + LAND_DURATION
const TEXT_EXIT_START = ARM_START + 0.2
const SEQUENCE_END = TEXT_EXIT_START + 0.65 + 0.06 * (LINES.length - 1)
const MOTION = {
  closeRowsAt: [2.4, 3.15, 3.85, ALIGN_START + 0.6],
  closeDuration: 0.5,
} as const

export function ScrollExperience({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const anchorRestoredRef = useRef(false)

  useGSAP(
    () => {
      const root = rootRef.current
      if (!root) return

      const media = gsap.matchMedia()
      media.add(
        {
          desktop: "(min-width: 601px)",
          mobile: "(max-width: 600px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          if (context.conditions?.reduceMotion) return
          const mobile = Boolean(context.conditions?.mobile)
          const stage = root.querySelector<HTMLElement>(".scroll-stage")!
          const panel = root.querySelector<HTMLElement>(".hero-panel")!
          const anchor = root.querySelector<HTMLElement>(".vinyl-anchor")!
          const vinyl = root.querySelector<HTMLElement>(".vinyl-surround")!
          const disc = root.querySelector<HTMLElement>(".vinyl-record")!
          const tilt = root.querySelector<HTMLElement>(".vinyl-tilt")!
          const player = root.querySelector<HTMLElement>(
            ".record-player--animated"
          )!
          const armLayer = root.querySelector<HTMLElement>(
            ".record-player--arm-overlay"
          )!
          const arm = armLayer.querySelector<SVGGElement>(".turntable-arm")!
          const copy = root.querySelector<HTMLElement>(".story-copy")!
          const rows = Array.from(
            root.querySelectorAll<HTMLElement>(".story-row")
          )
          const footer = root.querySelector<HTMLElement>(".story-footer")!
          const left = rows.map((row) =>
            row.querySelector<HTMLElement>(".story-left")!
          )
          const right = rows.map((row) =>
            row.querySelector<HTMLElement>(".story-right")!
          )

          root.classList.add("is-scroll-active")

          // Read layout coordinates, which remain stable while their elements transform.
          const originalCenter = () =>
            anchor.offsetTop + anchor.offsetHeight / 2
          const diameter = () =>
            mobile
              ? Math.max(60, Math.min(stage.clientWidth * 0.17, 140))
              : Math.min(
                  stage.clientWidth * 0.17,
                  stage.clientHeight * 0.22,
                  270
                )
          const smallScale = () => diameter() / disc.offsetWidth
          const rowCenter = (index: number) =>
            copy.offsetTop +
            rows[index].offsetTop +
            rows[index].offsetHeight / 2
          const travelTo = (center: number) => center - originalCenter()
          const platterCenter = () =>
            player.offsetTop + player.offsetHeight * (97 / 300)
          const platterScale = () =>
            (player.offsetWidth * 0.53) / disc.offsetWidth
          // Phones part each row at its own word break, and the record moves
          // to that break, so long halves can use the full width.
          const gapEdges = (index: number) => [
            left[index].offsetLeft + left[index].offsetWidth,
            right[index].offsetLeft,
          ]
          const splitX = (index: number) => {
            if (!mobile) return 0
            const [start, end] = gapEdges(index)
            return (start + end) / 2 - stage.clientWidth / 2
          }
          const parting = (index: number) => {
            const [start, end] = gapEdges(index)
            return (diameter() + 12 - (end - start)) / 2
          }
          const openLeft = (index: number) =>
            mobile
              ? -parting(index)
              : Math.min(
                  0,
                  stage.clientWidth / 2 -
                    diameter() / 2 -
                    22 -
                    (left[index].offsetLeft + left[index].offsetWidth)
                )
          const openRight = (index: number) =>
            mobile
              ? parting(index)
              : Math.max(
                  0,
                  stage.clientWidth / 2 +
                    diameter() / 2 +
                    22 -
                    right[index].offsetLeft
                )

          gsap.set(vinyl, {
            autoAlpha: 1,
            xPercent: -50,
            x: 0,
            y: 0,
            scale: 1,
            transformOrigin: "50% 50%",
          })
          gsap.set(rows, {
            autoAlpha: 0,
            filter: (index) => (index === 0 ? "blur(6px)" : "blur(12px)"),
            x: 0,
            xPercent: 0,
            y: 28,
          })
          gsap.set(footer, { autoAlpha: 0 })
          // Perspective lives on the parent in CSS; WebKit renders a
          // transform-level perspective() less foreshortened than Chromium.
          gsap.set(tilt, {
            rotationX: 0,
            transformOrigin: "50% 50%",
          })
          gsap.set([player, armLayer], { autoAlpha: 0, y: 24 })
          // Keep the hinge fixed in SVG space, including across responsive resizes.
          gsap.set(arm, { attr: { transform: "rotate(9 820 69)" } })

          const timeline = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              id: "vinyl-story",
              trigger: root,
              pin: stage,
              start: "top top",
              end: () => `+=${stage.clientHeight * SEQUENCE_END * 0.55}`,
              scrub: 0.35,
              anticipatePin: 1,
              invalidateOnRefresh: true,
            },
          })

          timeline
            .addLabel("leave-hero", 0)
            .to(
              panel,
              { y: () => -stage.clientHeight * 1.05, duration: 1.85 },
              "leave-hero"
            )
            .to(panel, { autoAlpha: 0, duration: 0.45 }, 1.4)
            .to(
              vinyl,
              {
                x: () => (splitX(0) + splitX(1)) / 2,
                y: () => travelTo((rowCenter(0) + rowCenter(1)) / 2),
                scale: smallScale,
                duration: 2,
                ease: "power1.inOut",
              },
              "leave-hero"
            )
            .to(
              disc,
              { rotation: SEQUENCE_END * 54, duration: SEQUENCE_END },
              0
            )
            .addLabel("reveal", REVEAL_START)
            .to(
              rows[0],
              {
                autoAlpha: 1,
                filter: "blur(0px)",
                y: 0,
                duration: 0.55,
                ease: "power1.out",
              },
              REVEAL_START - 0.1
            )
            .to(
              rows.slice(1),
              {
                autoAlpha: 1,
                filter: "blur(0px)",
                y: 0,
                duration: REVEAL_DURATION,
                stagger: (index) => REVEAL_GROUPS[index + 1] * ROW_STAGGER,
              },
              "reveal"
            )
            .to(
              [player, armLayer],
              { autoAlpha: 1, y: 0, duration: 0.75, ease: "power1.out" },
              REVEAL_START - 0.1
            )
            .to(footer, { autoAlpha: 1, duration: 0.5 }, REVEAL_END - 0.5)
            .to(left[0], { x: () => openLeft(0), duration: 0.65 }, 1.35)
            .to(right[0], { x: () => openRight(0), duration: 0.65 }, 1.35)
            .to(left[1], { x: () => openLeft(1), duration: 0.65 }, 1.6)
            .to(right[1], { x: () => openRight(1), duration: 0.65 }, 1.6)
            .to(
              vinyl,
              {
                x: () => splitX(1),
                y: () => travelTo(rowCenter(1)),
                duration: 0.55,
                ease: "power1.inOut",
              },
              2
            )
            .to(left[2], { x: () => openLeft(2), duration: 0.55 }, 2.05)
            .to(right[2], { x: () => openRight(2), duration: 0.55 }, 2.05)
            .to(
              vinyl,
              {
                x: () => splitX(2),
                y: () => travelTo(rowCenter(2)),
                duration: REVEAL_END - 2.55,
                ease: "power1.inOut",
              },
              2.55
            )
            .to(
              left[3],
              { x: () => openLeft(3), duration: 0.55 },
              LAST_ROW_START - 0.35
            )
            .to(
              right[3],
              { x: () => openRight(3), duration: 0.55 },
              LAST_ROW_START - 0.35
            )
            .to(
              vinyl,
              {
                x: () => splitX(3),
                y: () => travelTo(rowCenter(3)),
                duration: LAST_ROW_DURATION,
                ease: "power1.inOut",
              },
              LAST_ROW_START
            )
            .addLabel("tilt-above-player", FLIP_START)
            .to(
              tilt,
              { rotationX: 87, duration: FLIP_DURATION, ease: "sine.inOut" },
              "tilt-above-player"
            )
            .to(
              vinyl,
              {
                x: () => -player.offsetWidth * 0.085,
                y: () => travelTo(platterCenter() - (mobile ? 34 : 54)),
                duration: ALIGN_DURATION,
                ease: "sine.inOut",
              },
              ALIGN_START
            )
            // Grow only after it has tilted far enough to clear the closing line.
            .to(
              vinyl,
              {
                scale: platterScale,
                duration: LAND_START - GROW_START,
                ease: "sine.inOut",
              },
              GROW_START
            )
            .addLabel("land-on-platter", LAND_START)
            .to(
              vinyl,
              {
                y: () => travelTo(platterCenter()),
                duration: LAND_DURATION,
                ease: "power2.inOut",
              },
              "land-on-platter"
            )
            .to(
              arm,
              {
                attr: { transform: "rotate(0 820 69)" },
                duration: 0.5,
                ease: "power2.inOut",
              },
              ARM_START
            )
            .addLabel("after-placement", TEXT_EXIT_START)
            .to(
              rows,
              {
                autoAlpha: 0,
                filter: "blur(14px)",
                duration: 0.65,
                stagger: { each: 0.06, from: "end" },
              },
              "after-placement"
            )
            .to(footer, { autoAlpha: 0, duration: 0.5 }, "after-placement")

          rows.forEach((_, index) => {
            timeline.to(
              [left[index], right[index]],
              { x: 0, duration: MOTION.closeDuration },
              MOTION.closeRowsAt[index]
            )
          })

          let disposed = false
          let anchorFrame = 0
          let stopRemembering = () => {}
          const restoreAnchor = () => {
            if (disposed) return
            // Let browser hash scrolling and the pinned layout finish first.
            anchorFrame = requestAnimationFrame(() => {
              anchorFrame = requestAnimationFrame(() => {
                if (disposed) return
                if (!anchorRestoredRef.current) {
                  anchorRestoredRef.current = true
                  // Back/forward/reload: the browser restored its offset before
                  // the pin spacer existed, so re-apply the remembered one.
                  const saved = readScrollPosition()
                  const target = document.getElementById(
                    window.location.hash.slice(1)
                  )
                  if (saved !== null) {
                    window.scrollTo({ top: saved, behavior: "instant" })
                  } else if (target && !stage.contains(target)) {
                    window.scrollTo({
                      top: target.getBoundingClientRect().top + window.scrollY,
                      behavior: "instant",
                    })
                  }
                }
                stopRemembering = rememberScrollPosition()
              })
            })
          }
          void document.fonts.ready.then(() => {
            if (disposed) return
            ScrollTrigger.refresh()
            if (document.readyState === "complete") restoreAnchor()
            else window.addEventListener("load", restoreAnchor, { once: true })
          })
          return () => {
            disposed = true
            cancelAnimationFrame(anchorFrame)
            stopRemembering()
            window.removeEventListener("load", restoreAnchor)
            root.classList.remove("is-scroll-active")
          }
        },
        root
      )
      return () => media.revert()
    },
    { scope: rootRef, dependencies: [MOTION], revertOnUpdate: true }
  )

  return (
    <div className="scroll-experience" ref={rootRef}>
      <div className="scroll-stage">
        {children}
        <section className="listening-story" aria-labelledby="listening-title">
          <h2 className="story-copy" id="listening-title">
            <span className="visually-hidden">
              Hi-fi is not only about the gear. It&apos;s about finding what
              works for you.
            </span>
            {LINES.map(([first, second]) => (
              <span className="story-row" aria-hidden="true" key={first}>
                <span className="story-left">{first}</span>
                <span className="story-right">{second}</span>
              </span>
            ))}
          </h2>
          <RecordPlayer variant="static" />
          <div className="story-footer" aria-hidden="true">
            <span>
              <i className="square" />
              Cambridge, Massachusetts
            </span>
            <span>
              Since 1973
              <i className="square" />
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}
