import Image from "next/image"
import { DitherBackground } from "@/components/dither-background"
import { VinylRecord } from "@/components/vinyl-record"
import { ScrollExperience } from "@/components/scroll-experience"
import { RecordPlayer, RecordPlayerArm } from "@/components/record-player"
import { CategorySection } from "@/components/category-section"
import { ProductLinesSection } from "@/components/product-lines-section"
import { HeroToday } from "@/components/hero-today"
import { HeroContact } from "@/components/hero-contact"
import { VisitSection } from "@/components/visit-section"
import { ContactFooter } from "@/components/contact-footer"
import { SiteNav } from "@/components/site-nav"
import { getStoreSchedule } from "@/lib/store-hours-data"

// Regenerate at most every 5 minutes, matching the store hours cache.
export const revalidate = 300

export default async function Page() {
  const schedule = await getStoreSchedule()
  return (
    <main id="top" className="landing">
      <a className="skip-link" href="#hero-title">
        Skip to content
      </a>
      <SiteNav />
      <ScrollExperience>
        <header className="site-header">
          <a className="brand" href="#top" aria-label="Q Audio home">
            <Image
              src="/qaudio-logo.svg"
              alt="Q Audio"
              width={47}
              height={57}
              priority
            />
          </a>
        </header>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-panel">
            <DitherBackground />
            <div className="hero-copy">
              <p className="hero-eyebrow">Independent hi-fi since 1973</p>
              <h1 id="hero-title">
                HEAR IT
                <br />
                FOR YOURSELF.
              </h1>
            </div>
            <div className="hero-captions">
              <HeroToday schedule={schedule} />
              <HeroContact />
            </div>
            <span className="edition-note">Q AUDIO — EST. 1973</span>
            <div className="vinyl-anchor" aria-hidden="true" />
          </div>
          <VinylRecord />
          <RecordPlayer />
          <RecordPlayerArm />
        </section>
      </ScrollExperience>
      <CategorySection />
      <ProductLinesSection />
      <VisitSection schedule={schedule} />
      <ContactFooter />
    </main>
  )
}
