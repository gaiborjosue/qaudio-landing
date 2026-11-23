import type { Metadata } from "next"
import type { Product } from "./catalog"
import { isOrderableAvailability, productHref } from "./catalog"
import type { NewsPost } from "./news"
import { WEEKDAYS, storeClock, type StoreSchedule } from "./store-hours"
import {
  INSTAGRAM_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  STORE_ID,
  siteUrl,
} from "./site"

type PageIdentity = {
  title: string
  description?: string
  path: string
  image?: { src: string; alt?: string; width?: number; height?: number }
}

/** Metadata fallback for older products with an empty card line; never saves. */
export function productDescription(product: Product) {
  const text = (product.short_description.trim() || product.description || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (!text)
    return `${product.name} at Q Audio, an independent hi-fi store in Cambridge, Massachusetts.`
  if (text.length <= 180) return text
  const cut = text.slice(0, 180)
  const space = cut.lastIndexOf(" ")
  return `${cut.slice(0, space > 120 ? space : 180).replace(/[\s,.;:–—-]+$/, "")}…`
}

export function pageMetadata({
  title,
  description = SITE_DESCRIPTION,
  path,
  image,
}: PageIdentity): Metadata {
  const socialTitle = title === SITE_NAME ? title : `${title} — ${SITE_NAME}`
  const images = image
    ? [
        {
          url: image.src,
          alt: image.alt ?? title,
          width: image.width,
          height: image.height,
        },
      ]
    : [
        {
          url: siteUrl("/opengraph-image"),
          width: 1200,
          height: 630,
          alt: SITE_NAME,
        },
      ]
  return {
    title,
    description,
    alternates: { canonical: siteUrl(path) },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      url: siteUrl(path),
      title: socialTitle,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images,
    },
  }
}

/** Escape content from the CMS before putting JSON inside an HTML script. */
export const jsonLd = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c")

export function breadcrumbs(items: readonly { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(({ name, path }, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: siteUrl(path),
    })),
  }
}

export function storeStructuredData(schedule: StoreSchedule) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": siteUrl("/#website"),
        url: siteUrl(),
        name: SITE_NAME,
        publisher: { "@id": STORE_ID },
      },
      {
        "@type": "ElectronicsStore",
        "@id": STORE_ID,
        name: SITE_NAME,
        url: siteUrl(),
        description: SITE_DESCRIPTION,
        telephone: "+1-617-547-2727",
        email: "info@qaudio.com",
        image: siteUrl("/store-interior.jpeg"),
        logo: siteUrl("/qaudio-logo.svg"),
        address: {
          "@type": "PostalAddress",
          streetAddress: "5 Brookline Street",
          addressLocality: "Cambridge",
          addressRegion: "MA",
          postalCode: "02139",
          addressCountry: "US",
        },
        sameAs: [INSTAGRAM_URL],
        // Appointment-only hours are not represented as either open or closed.
        openingHoursSpecification: schedule.weekly.flatMap((hours, index) =>
          hours === "appointment"
            ? []
            : [
                {
                  "@type": "OpeningHoursSpecification",
                  dayOfWeek: `https://schema.org/${WEEKDAYS[index]}`,
                  opens: hours === "closed" ? "00:00" : hours.open,
                  closes: hours === "closed" ? "00:00" : hours.close,
                },
              ]
        ),
        specialOpeningHoursSpecification: schedule.changes.flatMap((change) =>
          change.hours === "appointment"
            ? []
            : [
                {
                  "@type": "OpeningHoursSpecification",
                  validFrom: change.start,
                  validThrough: change.end ?? change.start,
                  opens:
                    change.hours === "closed" ? "00:00" : change.hours.open,
                  closes:
                    change.hours === "closed" ? "00:00" : change.hours.close,
                },
              ]
        ),
      },
    ],
  }
}

const RETURN_POLICY_URL = siteUrl("/in-store-policies")
const RETURN_POLICY_ID = `${RETURN_POLICY_URL}#return-policy`

export function returnPolicyStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": STORE_ID,
    name: SITE_NAME,
    url: siteUrl(),
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      "@id": RETURN_POLICY_ID,
      merchantReturnLink: RETURN_POLICY_URL,
    },
  }
}

export function productStructuredData(product: Product) {
  const url = siteUrl(productHref(product))
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    url,
    name: product.name,
    description: productDescription(product),
    image: product.images.map((image) => image.src),
    ...(product.brand && {
      brand: { "@type": "Brand", name: product.brand.name },
    }),
    category: product.category.name,
    ...(product.price_cents !== null &&
      isOrderableAvailability(product.availability) && {
        offers: {
          "@type": "Offer",
          url,
          price: (product.price_cents / 100).toFixed(2),
          priceCurrency: "USD",
          availability:
            product.availability === "back_order"
              ? "https://schema.org/BackOrder"
              : "https://schema.org/InStoreOnly",
          seller: {
            "@type": "Organization",
            "@id": STORE_ID,
            name: SITE_NAME,
            url: siteUrl(),
          },
          availableAtOrFrom: { "@id": STORE_ID },
          hasMerchantReturnPolicy: { "@id": RETURN_POLICY_ID },
          ...(product.sale && {
            priceValidUntil: storeClock(new Date(product.sale.ends_at)).date,
          }),
          itemCondition:
            product.condition === "New"
              ? "https://schema.org/NewCondition"
              : "https://schema.org/UsedCondition",
        },
      }),
  }
}

export function articleStructuredData(post: NewsPost) {
  const url = siteUrl(`/news/${post.slug}`)
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    url,
    mainEntityOfPage: url,
    headline: post.title,
    description: post.excerpt,
    image: [post.cover.src],
    datePublished: post.publishedAt,
    dateModified: post.modifiedAt,
    author: { "@type": "Organization", name: SITE_NAME, url: siteUrl() },
    publisher: {
      "@type": "Organization",
      "@id": STORE_ID,
      name: SITE_NAME,
      url: siteUrl(),
      logo: { "@type": "ImageObject", url: siteUrl("/qaudio-logo.svg") },
    },
  }
}
