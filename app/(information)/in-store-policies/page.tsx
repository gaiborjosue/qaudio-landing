import Link from "next/link"
import { StructuredData } from "@/components/structured-data"
import { breadcrumbs, pageMetadata } from "@/lib/seo"

export const metadata = pageMetadata({
  title: "In-store policies",
  description:
    "Q Audio's policies for new, demo, and used equipment, special orders, shipping, and privacy.",
  path: "/in-store-policies",
})

// Business terms retained from the owner's existing public policies. No new
// return, warranty, or delivery commitments are introduced by the redesign.
export default function PoliciesPage() {
  return (
    <>
      <StructuredData
        value={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "In-store policies", path: "/in-store-policies" },
        ])}
      />
      <h1>In-store policies</h1>
      <section>
        <h2>New equipment</h2>
        <ul>
          <li>
            7-day money-back guarantee; returns are subject to a 15% restocking
            fee.
          </li>
          <li>30-day defective exchange.</li>
          <li>Manufacturer’s USA limited warranty applies.</li>
        </ul>
      </section>
      <section>
        <h2>Demo equipment</h2>
        <ul>
          <li>
            7-day money-back guarantee; returns are subject to a 15% restocking
            fee.
          </li>
          <li>Manufacturer’s USA limited warranty applies.</li>
        </ul>
        <p>
          Demo equipment has only been displayed or played in our store. Home
          demos and returned open-box items are considered used. Returned demo
          equipment is sold as used.
        </p>
      </section>
      <section>
        <h2>Used equipment</h2>
        <ul>
          <li>
            7-day money-back guarantee with no restocking fee. Shipping charges
            apply.
          </li>
          <li>
            90-day warranty, excluding phono cartridges, styli, and units sold
            as-is.
          </li>
        </ul>
      </section>
      <section>
        <h2>Exceptions</h2>
        <p>
          Special orders are non-cancellable and deposits are non-refundable.
          Ordered-for-you purchases, in-ear headphones, phono cartridges, and
          needles are non-returnable.
        </p>
      </section>
      <section id="shipping">
        <h2>Shipping</h2>
        <p>
          Unless otherwise specified, we ship via UPS Ground, with USPS for
          small parts and accessories. Massachusetts sales are subject to 6.25%
          sales tax.
        </p>
        <p>
          Free delivery is available to the Braintree Five Corners area for
          South Shore customers.
        </p>
        <p>
          <Link href="/how-to-order">How to order</Link>
        </p>
      </section>
      <section id="privacy">
        <h2>Privacy</h2>
        <p>We do not share your information or send spam.</p>
      </section>
    </>
  )
}
