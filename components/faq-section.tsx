"use client"

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { ArrowUpRight } from "lucide-react"
import { AnimatePresence, MotionConfig, motion } from "motion/react"
import DepthCarousel from "./DepthCarousel"
import { AlbumGrid } from "./album-grid"
import styles from "./faq-section.module.css"

const Phone = ({ children = "617-547-2727" }: { children?: ReactNode }) => (
  <a href="tel:+16175472727">{children}</a>
)

const REPAIR_PHOTOS = [
  {
    image: "/repair/service-bench.webp",
    alt: "Q Audio service bench with test equipment and parts drawers",
    caption: "Our service bench",
  },
  {
    image: "/repair/marantz-2270-board.webp",
    alt: "Circuit board inside a Marantz 2270 receiver during repair",
    caption: "Repairing a Marantz 2270",
  },
  {
    image: "/repair/marantz-2270-bench.webp",
    alt: "Marantz 2270 receiver opened up on the service bench",
    caption: "Repairing a Marantz 2270",
  },
  {
    image: "/repair/anthem-mrx1140-rear.webp",
    alt: "Anthem MRX 1140 receiver opened on the bench for an HDMI card upgrade",
    caption: "Upgrading the HDMI card on an Anthem MRX 1140",
  },
  {
    image: "/repair/anthem-mrx1140-hdmi-boards.webp",
    alt: "Two HDMI cards from the Anthem MRX 1140 upgrade",
    caption: "Upgrading the HDMI card on an Anthem MRX 1140",
  },
]

// Carousel card sizing: the base size, its largest size, and the width the
// carousel needs beyond a card (2 × spread 48 + gutter 24).
const BASE_CARD_WIDTH = 320
const MAX_CARD_WIDTH = 360
const CARD_SPACE = 120

function RepairPhotos() {
  const [active, setActive] = useState(0)
  const [width, setWidth] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width))
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Cards grow with the answer's width (never shrinking below the base size,
  // which the carousel scales down on its own), keeping the 4:3 ratio.
  const cardWidth = Math.min(
    Math.max(width - CARD_SPACE, BASE_CARD_WIDTH),
    MAX_CARD_WIDTH
  )
  const cardHeight = Math.round((cardWidth * 3) / 4)

  return (
    <div
      className={styles.photos}
      ref={ref}
      style={
        {
          "--photos-h":
            width >= BASE_CARD_WIDTH + CARD_SPACE
              ? `${cardHeight + 68}px`
              : undefined,
        } as CSSProperties
      }
    >
      <DepthCarousel
        items={REPAIR_PHOTOS}
        label="Repair photos"
        cardWidth={cardWidth}
        cardHeight={cardHeight}
        radius={12}
        tint="#111"
        depth={150}
        spread={48}
        tilt={16}
        visibleCards={3}
        falloff={0.12}
        blur={2}
        gutter={24}
        showIndicators={false}
        onChange={(index: number) => setActive(index)}
      />
      {/* Repeats the active photo's alt text, so it's visual only. */}
      <p className={styles.caption} aria-hidden="true">
        {REPAIR_PHOTOS[active].caption}
      </p>
    </div>
  )
}

type Faq = {
  question: string
  // A null answer keeps the question visible but not expandable.
  answer: ReactNode | null
  // Long answers open toward the roomier side and scroll inside the card.
  tall?: boolean
}

const FAQS: Faq[] = [
  {
    question:
      "Do you provide custom installations for businesses and residential?",
    answer: (
      <>
        <p>Need help connecting or installing your AV system?</p>
        <p>
          We can do it for you at affordable prices. Call{" "}
          <Phone>617.547.2727</Phone> for details and to schedule an in-home
          appointment.
        </p>
        <p>
          We provide custom installation at affordable prices for your home or
          business. Call us at <Phone />. Whatever you do, and however you do
          it, contact us first. Our goal is to ensure you get only the finest
          quality service at superb prices.
        </p>
      </>
    ),
  },
  {
    question: "Do you also repair audio equipment?",
    tall: true,
    answer: (
      <>
        <p>
          Yes, we do repairs. We specialize in Anthem, Adcom, Arcam, NAD,
          McIntosh, Onkyo, Denon, Sony, Rega, Unison Research, Thorens, Dual,
          and many others.
        </p>
        <ul className={styles.services}>
          <li>Amplifiers</li>
          <li>Speakers</li>
          <li>Turntables</li>
          <li>Tape Decks</li>
          <li>CD Players</li>
          <li>and more</li>
        </ul>
        <RepairPhotos />
        <p>
          Looking for a reliable, local dealer to repair that malfunctioning
          amplifier, replace a speaker’s woofer/tweeter or someone to resurrect
          that old turntable? Look no further than Q Audio. Need a new
          phonograph cartridge installed? Is your CD player skipping? Not sure
          whether to repair or replace?
        </p>
        <p>
          Bring us your items for service anytime during business hours and
          we’ll provide you with a repair estimate, normally within 3-5 business
          days. A diagnostic fee of $100 (first hour of work) per item is
          payable when you drop it off and is applicable to your approved
          repair. The diagnostic fee is non-refundable. Services performed are
          warranted for 90 days parts and labor.
        </p>
        <p>
          <strong>
            Please always call <Phone>(617) 547-2727</Phone> for appointment
            before coming in with units!
          </strong>
        </p>
        <p>
          Please note that we repair traditional audio components only. We do
          not service items that cost more to repair than they cost to replace
          or purchase new. Many categories of sound products are manufactured in
          a manner that allows them to be sold very inexpensively, but makes no
          allowance for them to be repaired. For example, the injection-mold
          plastic chassis mini speaker that comes as part of a $99 5-piece micro
          system.
        </p>
        <p>
          We do not service Bose and Beats headphones, suitcase like turntables
          and all in one systems. (like Crosley)
        </p>
      </>
    ),
  },
  {
    question:
      "I have a random question. May I ask you about something? This is probably a very long question, because we really need to test if the multi-line question feature works on all devices.",
    answer: (
      <>
        <p>We have a random answer. Go ahead.</p>
        <p>
          Call us at <Phone />
        </p>
      </>
    ),
  },
  {
    question: "I can't make it to the store. Can you ship equipment to me?",
    answer: (
      <>
        <p>
          We accept orders by phone or email. Please call: <Phone />
        </p>
        <p>
          Please email: <a href="mailto:info@qaudio.com">info@qaudio.com</a>
        </p>
        <p>
          We accept: Debit / MasterCard / VISA / Discover / AMEX / Apple Pay /
          PayPal.
        </p>
        <p>Simply provide us (via email or phone) with your:</p>
        <ul>
          <li>Name as it appears on your charge card</li>
          <li>Billing address where card statements are sent</li>
          <li>Ship-to address if different</li>
          <li>Home and work telephone numbers</li>
        </ul>
        <p>
          <strong>Call us</strong> (for security, <strong>do not email</strong>)
          with:
        </p>
        <ul>
          <li>Card number and expiration date</li>
          <li>V-code (security code on back of card)</li>
        </ul>
      </>
    ),
  },
]

// Morph Surface–style spring: pills grow into cards in place.
const SPRING = {
  type: "spring",
  stiffness: 380,
  damping: 34,
  mass: 0.8,
} as const

type Direction = "down" | "up"
type OpenCard = {
  index: number
  direction: Direction
  height: number
  maxHeight?: number
}

// Viewport margin kept around tall cards, and the smallest and largest they may get.
const EDGE = 16
const MIN_TALL = 320
const MAX_TALL = 480

export function FaqSection() {
  const [open, setOpen] = useState<OpenCard | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // The open card floats over other questions, so a click outside closes it.
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      const card = listRef.current?.children[open.index]
      if (card && !card.contains(event.target as Node)) setOpen(null)
    }
    document.addEventListener("pointerdown", closeOutside)
    return () => document.removeEventListener("pointerdown", closeOutside)
  }, [open])

  function toggle(index: number, cell: HTMLElement) {
    if (open?.index === index) return setOpen(null)
    if (FAQS[index].tall) {
      // Open toward the roomier side, never past the viewport edge.
      const rect = cell.getBoundingClientRect()
      const above = rect.bottom - EDGE
      const below = innerHeight - rect.top - EDGE
      return setOpen({
        index,
        direction: above > below ? "up" : "down",
        height: cell.offsetHeight,
        maxHeight: Math.min(
          Math.max(Math.max(above, below), MIN_TALL),
          MAX_TALL
        ),
      })
    }
    // Like a popover: upper rows open downward, lower rows open upward.
    const columns = getComputedStyle(
      cell.parentElement!
    ).gridTemplateColumns.split(" ").length
    const row = Math.floor(index / columns)
    const rows = Math.ceil(FAQS.length / columns)
    setOpen({
      index,
      direction: row < rows / 2 ? "down" : "up",
      height: cell.offsetHeight,
    })
  }

  function closeOnEscape(event: KeyboardEvent<HTMLLIElement>) {
    if (event.key !== "Escape" || !open) return
    setOpen(null)
    event.currentTarget.querySelector("button")?.focus()
  }

  return (
    <section className={styles.faq} aria-labelledby="faq-title">
      <AlbumGrid avoid={contentRef} />
      <div ref={contentRef} className={styles.content}>
        <h2 id="faq-title">Frequently asked questions</h2>
        <MotionConfig transition={SPRING} reducedMotion="user">
          <ul className={styles.list} ref={listRef}>
            {FAQS.map(({ question, answer, tall }, index) => {
              const isOpen = open?.index === index
              const direction = isOpen ? open.direction : undefined
              const id = `faq-${index}`
              return (
                <li
                  key={question}
                  className={styles.item}
                  data-open={isOpen}
                  onKeyDown={closeOnEscape}
                >
                  {/* Invisible copy holds the cell's pill size while the card floats. */}
                  <div
                    className={`${styles.question} ${styles.ghost}`}
                    data-static={!answer}
                    aria-hidden="true"
                  >
                    <span>{question}</span>
                    {answer ? <span className={styles.icon} /> : null}
                  </div>
                  <motion.div
                    layout
                    className={styles.surface}
                    data-direction={direction}
                    data-tall={tall}
                    style={{
                      borderRadius: isOpen ? 24 : 28,
                      maxHeight: isOpen ? open.maxHeight : undefined,
                    }}
                  >
                    {answer ? (
                      <motion.button
                        layout="position"
                        type="button"
                        id={`${id}-question`}
                        className={styles.question}
                        style={{ minHeight: isOpen ? open.height : undefined }}
                        aria-expanded={isOpen}
                        aria-controls={`${id}-answer`}
                        onClick={(event) =>
                          toggle(index, event.currentTarget.closest("li")!)
                        }
                      >
                        <span>{question}</span>
                        <span className={styles.icon} aria-hidden="true">
                          <motion.span
                            className={styles.arrow}
                            animate={{
                              rotate: !isOpen
                                ? 0
                                : direction === "up"
                                  ? -45
                                  : 135,
                            }}
                          >
                            <ArrowUpRight size={18} strokeWidth={1.5} />
                          </motion.span>
                        </span>
                      </motion.button>
                    ) : (
                      <p className={styles.question}>{question}</p>
                    )}
                    <AnimatePresence initial={false} mode="popLayout">
                      {isOpen && answer ? (
                        <motion.div
                          key="answer"
                          layout="position"
                          id={`${id}-answer`}
                          role="region"
                          aria-labelledby={`${id}-question`}
                          className={styles.answer}
                          initial={{
                            opacity: 0,
                            y: direction === "up" ? 6 : -6,
                          }}
                          animate={{
                            opacity: 1,
                            y: 0,
                            transition: { duration: 0.24, delay: 0.16 },
                          }}
                          exit={{ opacity: 0, transition: { duration: 0.12 } }}
                        >
                          {answer}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>
                </li>
              )
            })}
          </ul>
        </MotionConfig>
      </div>
    </section>
  )
}
