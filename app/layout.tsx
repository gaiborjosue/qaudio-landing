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
})

export const metadata: Metadata = {
  title: "Q Audio — For the love of listening",
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
