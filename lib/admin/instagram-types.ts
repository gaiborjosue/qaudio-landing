/** Only this public connection summary may cross into client components. */
export type InstagramStatus = {
  state:
    "connected" | "disconnected" | "reconnect" | "unavailable" | "unconfigured"
  accounts: { id: string; username: string }[]
  connectUrl: string | null
  /** Some in-scope accounts need attention even if another one is connected. */
  needsAttention?: boolean
  message?: string
}
