"use client"

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next"
import { SITE_ORIGIN } from "@/lib/site"

const internalPath = /^\/(?:admin|auth|api|eve|_eve_internal)(?:\/|$)/i

function beforeSend(event: BeforeSendEvent) {
  const url = new URL(event.url)
  if (url.origin !== SITE_ORIGIN || internalPath.test(url.pathname)) return null

  return { ...event, url: url.origin + url.pathname }
}

export function SiteAnalytics() {
  return <Analytics beforeSend={beforeSend} />
}
