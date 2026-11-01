import type { Metadata } from "next"
import { Bodoni_Moda, Epilogue } from "next/font/google"
import "./globals.css"
import { SiteLoader } from "@/components/site-loader"
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
  title: {
    default: "Q Audio — For the love of listening",
    template: "%s — Q Audio",
  },
  description:
    "Independent hi-fi in Cambridge, Massachusetts, since 1973. Exceptional sound. A lifetime of listening.",
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
