import Image from "next/image"
import Link from "next/link"
import { SiteNav } from "@/components/site-nav"

/** Skip link, main menu, and logo header shared by the inner pages. */
export function SiteHeader({ contentId }: { contentId: string }) {
  return (
    <>
      <a className="skip-link" href={`#${contentId}`}>
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
    </>
  )
}
