import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { CableHeading } from "@/components/cable-heading"
import { DealCard } from "@/components/deal-card"
import { FooterBar } from "@/components/footer-bar"
import { SiteNav } from "@/components/site-nav"
import { getDeals } from "@/lib/deals-data"
import { pageMetadata } from "@/lib/seo"
import styles from "./qdeal.module.css"

export const metadata: Metadata = pageMetadata({
  title: "QDeal",
  path: "/qdeal",
  description:
    "Closeouts, price matching and honest advice from Q Audio in Cambridge, Massachusetts.",
})

export default async function QDealPage() {
  const deals = await getDeals("qdeal")
  return (
    <div className={styles.page}>
      <a className="skip-link" href="#qdeal-content">
        Skip to content
      </a>
      <SiteNav />
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Q Audio home">
          <Image
            src="/qaudio-logo.svg"
            alt="Q Audio"
            width={47}
            height={57}
            loading="eager"
          />
        </Link>
      </header>
      <main id="qdeal-content" className={styles.main}>
        <CableHeading connector="rca" className={styles.titleRow}>
          <h1 className={styles.heading}>QDeal</h1>
        </CableHeading>
        {deals.length > 0 ? (
          <div className={styles.deals}>
            {deals.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        ) : null}
        <section className={styles.advice} aria-labelledby="advice-title">
          <h2 id="advice-title" className={styles.adviceTitle}>
            Proper advice is priceless!
          </h2>
          <div className={styles.point}>
            <h3>Knowledge and Good Advice from Q Audio</h3>
            <p>
              We spend countless hours evaluating all kinds of HiFi equipment.
              We test all new technologies.
            </p>
            <p>
              We filter out what works, as advertised, and what doesn’t work.
              Then, if we like a particular product and find that its
              price-to-performance ratio is satisfactory we offer it to our
              customers.
            </p>
            <p>
              By doing so we offer you superior products—saving you time &amp;
              money while eliminating any frustration or dissatisfaction.
            </p>
          </div>
          <div className={styles.point}>
            <h3>A ‘great price’ is no guarantee of a ‘good deal’</h3>
            <p>
              People often make purchases based solely upon price. Seeing a
              price tag of 30% off, 40% off or 50% off MSRP suggests a ‘great
              price’ or a ‘good deal’, but frequently the offered product never
              sells at anywhere near MSRP or hasn’t a ‘regular’ everyday price.
              50% off an inflated list price is no ‘deal’. It’s deceptive.
            </p>
            <p>
              Ask yourself how does its price-to-performance ratio stack up
              against a product from Q Audio? Want to know the answer?{" "}
              <a href="tel:+16175472727">Call Q Audio</a> and find out if you’re
              being offered a great price and a good deal.
            </p>
          </div>
          <div className={styles.point}>
            <h3>
              Q Audio prices are competitive and we{" "}
              <span className={styles.nowrap}>price-match</span> any authorized
              dealer offerings
            </h3>
            <p>
              When you buy from Q Audio you can rest assured you’re getting the
              same discounts, deals and specials as seen on vendors’ websites.
              Often, we’re able to offer additional savings, too!
            </p>
            <p>
              Please be certain to <Link href="/#visit">visit us</Link> before
              you make any online ‘one-click’ transaction.
            </p>
          </div>
          <div className={styles.point}>
            <h3>Don’t forget you get our personal service and attention.</h3>
            <p>To us, you are a real person not a ‘computer click’.</p>
          </div>
          <div className={styles.point}>
            <h3>
              We are here to answer all your questions before and after the
              sale.
            </h3>
            <p className={styles.signoff}>Simply Priceless.</p>
          </div>
        </section>
      </main>
      <FooterBar />
    </div>
  )
}
