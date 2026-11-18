import { Suspense } from "react"
import { SiteHeader } from "@/components/site-header"
import { FooterBar } from "@/components/footer-bar"

export default function SalesLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  /** Intercepted /products/<slug> while the list is showing. */
  modal: React.ReactNode
}) {
  return (
    <>
      <SiteHeader contentId="sales-content" />
      {children}
      {/* The slot renders nothing visible; Suspense keeps its (intercepted,
          URL-dependent) route out of the prerendered shell. */}
      <Suspense>{modal}</Suspense>
      <FooterBar />
    </>
  )
}
