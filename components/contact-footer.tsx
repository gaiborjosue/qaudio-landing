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
            <div>
              <span>By Phone</span>
              <a href="tel:+16175472727">(617) 547-2727</a>
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
