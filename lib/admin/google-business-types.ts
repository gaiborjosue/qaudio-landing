/** Public connection summaries only; never provider credentials. */
export type GoogleBusinessStatus = {
  state:
    "connected" | "disconnected" | "reconnect" | "unavailable" | "unconfigured"
  accounts: { id: string; name: string }[]
  connectUrl: string | null
  needsAttention?: boolean
  message?: string
}

export const GOOGLE_BUSINESS_POST_KINDS = ["update", "offer", "event"] as const
export type GoogleBusinessPostKind = (typeof GOOGLE_BUSINESS_POST_KINDS)[number]

export const GOOGLE_BUSINESS_POST_LABELS: Record<
  GoogleBusinessPostKind,
  string
> = { update: "Update", offer: "Offer", event: "Event" }

export const GOOGLE_BUSINESS_TOPIC_TYPES = {
  update: "STANDARD",
  offer: "OFFER",
  event: "EVENT",
} as const

export const GOOGLE_BUSINESS_IMAGE = { width: 1200, height: 900 } as const
