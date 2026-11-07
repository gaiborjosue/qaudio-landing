/** Public connection summaries only; never provider credentials. */
export type GoogleBusinessStatus = {
  state:
    "connected" | "disconnected" | "reconnect" | "unavailable" | "unconfigured"
  accounts: { id: string; name: string }[]
  connectUrl: string | null
  needsAttention?: boolean
  message?: string
}
