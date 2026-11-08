import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/site"

export default function robots(): MetadataRoute.Robots {
  // Allow crawlers to read noindex headers on demo/admin responses. A robots
  // disallow would prevent them from seeing those indexing instructions.
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: siteUrl("/sitemap.xml"),
  }
}
