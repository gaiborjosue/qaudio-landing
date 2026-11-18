import { PhoneCall } from "lucide-react"
import { AudioCableDivider } from "./audio-cable-divider"
import { ContactForm } from "./contact-form"
import { FaqSection } from "./faq-section"
import { FooterBar } from "./footer-bar"
import styles from "./contact-footer.module.css"

export function ContactFooter() {
  return (
    <footer
      id="contact"
      className={styles.footer}
      aria-labelledby="footer-title"
    >
      <AudioCableDivider />
      <div className={styles.content}>
        <div className={styles.details}>
          <h2 id="footer-title">Get in touch</h2>
          <address>
            <div className={styles.phone}>
              <span>By Phone</span>
              <a
                className={styles.phoneLink}
                href="tel:+16175472727"
                aria-describedby="footer-phone-note"
              >
                <span className={styles.phoneIcon} aria-hidden="true">
                  <PhoneCall size={20} strokeWidth={1.4} />
                </span>
                <span className={styles.phoneNumber}>(617) 547-2727</span>
              </a>
              <p id="footer-phone-note" className={styles.phoneNote}>
                Rings the owner directly, so call anytime, even after hours.
                If he misses you, leave a voicemail and he’ll call you back.
              </p>
            </div>
            <div>
              <span>Email</span>
              <a href="mailto:info@qaudio.com">info@qaudio.com</a>
            </div>
          </address>
        </div>
        <ContactForm />
      </div>
      <FaqSection />
      <FooterBar />
    </footer>
  )
}
