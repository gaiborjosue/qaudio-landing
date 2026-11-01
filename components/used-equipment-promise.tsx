import Image from "next/image"
import { Check } from "lucide-react"
import styles from "./used-equipment-promise.module.css"

// Shown above the Used Equipment listings only, with the copy and photo from
// the live qaudio.com/used page.
export function UsedEquipmentPromise() {
  return (
    <section className={styles.promise} aria-labelledby="used-promise-title">
      <h2 id="used-promise-title" className="visually-hidden">
        Our used equipment promise
      </h2>
      <Image
        className={styles.photo}
        src="/used-equipment/q-audio-service.webp"
        alt="Q Audio’s service bench: test instruments and an oscilloscope above a vintage Marantz receiver, beside a close-up of a circuit board being soldered and the Q Audio logo"
        width={1000}
        height={508}
        sizes="(max-width: 760px) calc(100vw - 80px), (max-width: 1000px) 50vw, 540px"
        loading="eager"
      />
      <div>
        <ul className={styles.promises}>
          <li>
            <span className={styles.tick} aria-hidden="true">
              <Check size={13} strokeWidth={2} />
            </span>
            All our used products are sold with a money back guarantee.
          </li>
          <li>
            <span className={styles.tick} aria-hidden="true">
              <Check size={13} strokeWidth={2} />
            </span>
            All our used products are in 100% correct working order.
          </li>
        </ul>
        <p className={styles.detail}>
          Before we sell any used product: we’ve tested it, cleaned it, and/or
          repaired it, as need be.
        </p>
        <p className={styles.caption}>
          Shown to the left is our fully equipped service bench.
        </p>
      </div>
    </section>
  )
}
