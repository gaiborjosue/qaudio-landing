import type { InstagramStatus } from "./instagram-types"

type Summary = Pick<InstagramStatus, "state" | "accounts" | "needsAttention">
export type ConnectionHealth = "checking" | "healthy" | "warning"

/** A warning takes precedence; green requires every service to be checked. */
export function connectionHealth(
  statuses: readonly (Summary | null)[]
): ConnectionHealth {
  if (
    statuses.some(
      (status) =>
        status &&
        (status.state !== "connected" ||
          status.needsAttention ||
          status.accounts.length === 0)
    )
  )
    return "warning"
  return statuses.length > 0 && statuses.every(Boolean) ? "healthy" : "checking"
}
