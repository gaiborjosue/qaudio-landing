"use client"

import { useRef } from "react"

export function ContactButton() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  return (
    <>
      <button
        className="contact-button"
        onClick={() => dialogRef.current?.showModal()}
      >
        <span>Get in touch</span>
        <span className="contact-arrow" aria-hidden="true">
          ↗
        </span>
      </button>
      <dialog
        ref={dialogRef}
        className="contact-dialog"
        aria-labelledby="contact-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close()
        }}
      >
        <div className="contact-content">
          <button
            className="dialog-close"
            aria-label="Close contact details"
            onClick={() => dialogRef.current?.close()}
          >
            ×
          </button>
          <p className="contact-kicker">Q Audio · Cambridge, MA</p>
          <h2 id="contact-title">Let’s talk sound.</h2>
          <p>
            Find your next system. Rediscover an old favorite.
            <br />
            It all starts with a conversation.
          </p>
          <a className="contact-email" href="mailto:info@qaudio.com">
            info@qaudio.com <span aria-hidden="true">↗</span>
          </a>
          <a className="contact-phone" href="tel:+16175472727">
            (617) 547-2727
          </a>
          <address>
            5 Brookline Street
            <br />
            Cambridge, MA 02139
          </address>
        </div>
      </dialog>
    </>
  )
}
