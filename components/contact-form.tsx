"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import Image from "next/image"
import { Send } from "lucide-react"
import { LiquidGlass } from "@/components/ui/liquid-glass"
import { buildContactMailto } from "@/lib/contact"
import styles from "./contact-footer.module.css"

// Let the plane lift off before the email app takes focus.
const LAUNCH_DELAY = 380
const SENT_DURATION = 2600
const RETURN_DURATION = 450

type SendState = "idle" | "sent" | "returning"

export function ContactForm() {
  const [sendState, setSendState] = useState<SendState>("idle")
  const timersRef = useRef<number[]>([])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.reportValidity()) return
    const data = new FormData(form)
    const href = buildContactMailto({
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      message: String(data.get("message") ?? ""),
    })
    if (sendState !== "idle") {
      window.location.href = href
      return
    }

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    const later = (callback: () => void, delay: number) =>
      timersRef.current.push(window.setTimeout(callback, delay))
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    setSendState("sent")
    if (reduced) window.location.href = href
    else
      later(() => {
        window.location.href = href
      }, LAUNCH_DELAY)
    later(() => setSendState("returning"), SENT_DURATION)
    later(() => setSendState("idle"), SENT_DURATION + RETURN_DURATION)
  }

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      aria-labelledby="contact-form-title"
    >
      <div className={styles.formIntro}>
        <h3 id="contact-form-title">Or just use this form</h3>
        <p>We’ll get back to you as soon as possible.</p>
      </div>
      <div className={styles.field}>
        <label htmlFor="footer-name">Name</label>
        <input id="footer-name" name="name" autoComplete="name" required />
      </div>
      <div className={styles.field}>
        <label htmlFor="footer-email">Email Address</label>
        <input
          id="footer-email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="footer-message">
          Your Message to{" "}
          <span className={styles.brandName}>
            <Image src="/qaudio-logo.svg" alt="Q" width={15} height={18} />{" "}
            Audio
          </span>
        </label>
        <textarea id="footer-message" name="message" rows={4} required />
      </div>
      <div className={styles.actions}>
        <LiquidGlass
          className={`glass-action ${styles.sendGlass}`}
          data-send-state={sendState}
          radius={31}
          scale={120}
          aberration={56}
          bevelDepth={60}
          frost={0}
          tint={0}
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
          <span className={styles.sentTint} aria-hidden="true" />
          <button
            className="glass-action-content"
            type="submit"
            aria-describedby="contact-draft-note"
          >
            <span>Send Message</span>
            <span className="glass-action-icon" aria-hidden="true">
              <span className={styles.plane}>
                <Send size={21} strokeWidth={1.4} />
              </span>
            </span>
          </button>
        </LiquidGlass>
        <p id="contact-draft-note">
          Opens your{" "}
          <Image
            className={styles.mailIcon}
            src="/mail-icon.svg"
            alt="email"
            width={18}
            height={18}
          />{" "}
          app.
        </p>
      </div>
    </form>
  )
}
