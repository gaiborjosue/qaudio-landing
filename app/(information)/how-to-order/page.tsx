import Link from "next/link"
import { StructuredData } from "@/components/structured-data"
import { breadcrumbs, pageMetadata } from "@/lib/seo"

export const metadata = pageMetadata({
  title: "How to order",
  description:
    "Order hi-fi equipment from Q Audio by phone or email. Payment and shipping information for our Cambridge, Massachusetts store.",
  path: "/how-to-order",
})

export default function HowToOrderPage() {
  return (
    <>
      <StructuredData
        value={breadcrumbs([
          { name: "Home", path: "/" },
          { name: "How to order", path: "/how-to-order" },
        ])}
      />
      <h1>How to order</h1>
      <p>
        Call <a href="tel:+16175472727">(617) 547-2727</a> or email{" "}
        <a href="mailto:info@qaudio.com">info@qaudio.com</a> to order.
      </p>
      <h2>Payment</h2>
      <p>
        We accept PayPal (info@qaudio.com), MasterCard, Visa, Discover, American
        Express, Apple Pay, and Google Pay.
      </p>
      <h2>Credit card orders</h2>
      <p>Email us your:</p>
      <ul>
        <li>Name as it appears on your card</li>
        <li>Billing address</li>
        <li>Shipping address, if different</li>
        <li>Telephone number</li>
      </ul>
      <p>
        Then call us with your card number, expiration date, and security code.
        For security, do not email card details.
      </p>
      <p>
        <Link href="/in-store-policies">
          Returns, warranties, and shipping policies
        </Link>
      </p>
    </>
  )
}
