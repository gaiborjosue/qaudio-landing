import type { Metadata } from "next"
import { Bodoni_Moda, Epilogue } from "next/font/google"
import "./globals.css"
import { SiteLoader } from "@/components/site-loader"
import { SITE_ORIGIN } from "@/lib/site"
import { pageMetadata } from "@/lib/seo"
const epilogue = Epilogue({ subsets: ["latin"], variable: "--font-ui" })
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-editorial",
  display: "swap",
  // Kept for the editorial comparison in globals.css but unused, so don't
  // preload its files on every page.
  preload: false,
})

export const metadata: Metadata = {
  ...pageMetadata({ title: "Q Audio", path: "/" }),
  metadataBase: new URL(SITE_ORIGIN),
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
  icons: { icon: { url: "/qaudio-logo.svg", type: "image/svg+xml" } },
  title: {
    default: "Q Audio — For the love of listening",
    template: "%s — Q Audio",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${epilogue.variable} ${bodoni.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <SiteLoader />
        {children}
      </body>
    </html>
  )
}
