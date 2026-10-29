import Image from "next/image"
import { ContactButton } from "@/components/contact-button"
import { DitherBackground } from "@/components/dither-background"
import { VinylRecord } from "@/components/vinyl-record"
import { ScrollExperience } from "@/components/scroll-experience"
import { RecordPlayer, RecordPlayerArm } from "@/components/record-player"
import { CategorySection } from "@/components/category-section"
import { ProductLinesSection } from "@/components/product-lines-section"

export default function Page() {
  return (
    <main id="top" className="landing">
      <a className="skip-link" href="#hero-title">
        Skip to content
      </a>
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
          <p className="header-note">
            <span className="mini-equalizer" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            Independent hi-fi. Since 1973.
          </p>
          <ContactButton />
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
              <p>
                <span className="square" aria-hidden="true" />
                Analog soul. Extraordinary sound.
              </p>
              <p>
                Cambridge, Massachusetts
                <span className="square" aria-hidden="true" />
              </p>
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
    </main>
  )
}
