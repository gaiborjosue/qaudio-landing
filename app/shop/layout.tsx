import Image from "next/image"
import Link from "next/link"
import { SiteNav } from "@/components/site-nav"

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <a className="skip-link" href="#shop-content">
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
      {children}
    </>
  )
}
