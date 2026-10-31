"use client"

import type { PointerEvent } from "react"
import Image from "next/image"
import { ArrowUpRight, Bus, SquareParking, TrainFront } from "lucide-react"
import { LiquidGlass } from "@/components/ui/liquid-glass"
import { StoreHours } from "@/components/store-hours"
import styles from "./visit-section.module.css"

const DIRECTIONS_URL =
  "https://www.google.com/maps/dir/?api=1&destination=5+Brookline+St%2C+Cambridge%2C+MA+02139"
const GARAGE_URL =
  "https://en.parkopedia.com/parking/garage/green_street_garage/02139/cambridge/"
const BUS_ROUTES = ["1", "47", "64", "70", "70A", "CT1"]

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

export function VisitSection() {
  return (
    <section
      id="visit"
      className={styles.section}
      aria-labelledby="visit-title"
    >
      <div className={styles.content}>
        <div className={styles.location}>
          <h2 id="visit-title">Come in and listen.</h2>
          <h3 className={styles.label}>Location</h3>
          <address className={styles.address}>
            5 Brookline Street
            <br />
            Cambridge, MA 02139
          </address>
          <p className={styles.landmark}>
            Across from the Middle East Restaurant &amp; Nightclub.
          </p>
          <ul className={styles.routes}>
            <li>
              <TrainFront size={18} strokeWidth={1.4} aria-hidden="true" />
              <span>Red Line · Central Square</span>
            </li>
            <li>
              <Bus size={18} strokeWidth={1.4} aria-hidden="true" />
              <span className="visually-hidden">Bus routes</span>
              <span className={styles.buses}>
                {BUS_ROUTES.map((route) => (
                  <span key={route}>{route}</span>
                ))}
              </span>
            </li>
            <li>
              <SquareParking size={18} strokeWidth={1.4} aria-hidden="true" />
              <span className="visually-hidden">Parking: </span>
              <a href={GARAGE_URL} target="_blank" rel="noreferrer">
                Green Street Garage
              </a>
            </li>
          </ul>
          <LiquidGlass
            className={`glass-action ${styles.directions}`}
            radius={31}
            scale={120}
            aberration={56}
            bevelDepth={60}
            frost={0}
            tint={0}
            onPointerMove={trackGlassPointer}
          >
            <a
              className="glass-action-content"
              href={DIRECTIONS_URL}
              target="_blank"
              rel="noreferrer"
            >
              <span>Directions</span>
              <span className="glass-action-icon" aria-hidden="true">
                <ArrowUpRight size={21} strokeWidth={1.4} />
              </span>
            </a>
          </LiquidGlass>
        </div>
        <div className={styles.hoursColumn}>
          <div className={styles.backdrop} aria-hidden="true">
            {/* Eager: it can be the LCP when the page loads scrolled to this section. */}
            <Image
              src="/store-interior.jpeg"
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 70vw"
              loading="eager"
            />
          </div>
          <StoreHours />
        </div>
      </div>
    </section>
  )
}
