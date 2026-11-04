/** Only this public connection summary may cross into client components. */
export type InstagramStatus = {
  state:
    "connected" | "disconnected" | "reconnect" | "unavailable" | "unconfigured"
  accounts: { id: string; username: string }[]
  connectUrl: string | null
  message?: string
}
