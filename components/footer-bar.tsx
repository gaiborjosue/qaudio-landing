import Link from "next/link"
import styles from "./footer-bar.module.css"

// Add published menu pages here; keep navigation hidden until they exist.
const footerLinks: { href: string; label: string }[] = []

const INSTAGRAM_URL = "https://www.instagram.com/qaudiohifi"

export function FooterBar() {
  return (
    <div className={styles.bar}>
      <div className={styles.content}>
        <small>© 1980 – 2026 Q Audio, Cambridge, MA</small>
        <div className={styles.end}>
          {footerLinks.length > 0 ? (
            <nav aria-label="Footer">
              {footerLinks.map(({ href, label }) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
            </nav>
          ) : null}
          <a
            className={styles.social}
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Q Audio on Instagram"
          >
            {/* The Instagram glyph sits on the record's center label. */}
            <span className={styles.label} aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" />
              </svg>
            </span>
          </a>
        </div>
      </div>
    </div>
  )
}
