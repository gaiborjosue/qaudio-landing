import { SiteHeader } from "@/components/site-header"
import { FooterBar } from "@/components/footer-bar"

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <SiteHeader contentId="product-content" />
      {children}
      <FooterBar />
    </>
  )
}
