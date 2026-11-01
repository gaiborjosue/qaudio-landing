import { Suspense } from "react"
import { SiteHeader } from "@/components/site-header"

export default function ShopLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  /** Intercepted /products/<slug> while a shop list is showing. */
  modal: React.ReactNode
}) {
  return (
    <>
      <SiteHeader contentId="shop-content" />
      {children}
      {/* The slot renders nothing visible; Suspense keeps its (intercepted,
          URL-dependent) route out of the prerendered shell. */}
      <Suspense>{modal}</Suspense>
    </>
  )
}
