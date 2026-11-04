import Zernio, { ZernioApiError } from "@zernio/node"
import { z } from "zod"
import type { InstagramStatus } from "./instagram-types"

export type ZernioConfig = { apiKey: string; profileId: string }

/** Pin this site's admins to one business profile, even with a wider API key. */
export function readZernioConfig(
  env: Record<string, string | undefined> = process.env
): ZernioConfig | null {
  const apiKey = env.ZERNIO_API_KEY?.trim()
  const profileId = env.ZERNIO_PROFILE_ID?.trim()
  if (!apiKey || !profileId || !/^[a-f0-9]{24}$/i.test(profileId)) return null
  return { apiKey, profileId }
}

// Strip everything except the fields needed to decide and display connection
// status. Provider payloads and errors must never reach the browser or logs.
const accountSchema = z.object({
  _id: z.string().min(1),
  platform: z.string(),
  profileId: z.union([z.string(), z.object({ _id: z.string() })]),
  username: z
    .string()
    .trim()
    .regex(/^@?[A-Za-z0-9_.]{1,30}$/)
    .optional(),
  isActive: z.boolean(),
  needsReconnection: z.boolean().optional(),
  enabled: z.boolean().optional(),
})
const accountsSchema = z.object({ accounts: z.array(accountSchema) })
const connectUrl = "https://zernio.com"

export async function zernioInstagramStatus(
  config: ZernioConfig | null,
  fetcher: typeof fetch = fetch
): Promise<InstagramStatus> {
  if (!config)
    return {
      state: "unconfigured",
      accounts: [],
      connectUrl: null,
      message: "Instagram connection isn't configured.",
    }

  try {
    const client = new Zernio({ apiKey: config.apiKey, timeout: 10_000 })
    const { data } = await client.accounts.listAccounts({
      query: {
        profileId: config.profileId,
        platform: "instagram",
        excludeHidden: true,
      },
      fetch: fetcher,
      cache: "no-store",
      redirect: "error",
    })
    const parsed = accountsSchema.parse(data)
    const instagram = parsed.accounts.filter(
      (account) =>
        account.platform === "instagram" &&
        (typeof account.profileId === "string"
          ? account.profileId
          : account.profileId._id) === config.profileId &&
        account.enabled !== false
    )
    const accounts = instagram
      .filter(
        (account) =>
          account.isActive && !account.needsReconnection && account.username
      )
      .map((account) => ({
        id: account._id,
        username: account.username!.replace(/^@+/, ""),
      }))

    if (accounts.length) return { state: "connected", accounts, connectUrl }
    if (
      instagram.some(
        (account) => !account.isActive || account.needsReconnection
      )
    )
      return {
        state: "reconnect",
        accounts: [],
        connectUrl,
        message: "Reconnect Instagram in Zernio, then check again.",
      }
    if (instagram.length) throw new Error("Missing account name.")
    return {
      state: "disconnected",
      accounts: [],
      connectUrl,
      message:
        "Connect Instagram in this site's Zernio profile, then check again.",
    }
  } catch (error) {
    if (
      error instanceof ZernioApiError &&
      (error.statusCode === 401 || error.statusCode === 403)
    )
      return {
        state: "unconfigured",
        accounts: [],
        connectUrl: null,
        message: "The Zernio API key or profile access needs attention.",
      }
    return {
      state: "unavailable",
      accounts: [],
      connectUrl,
      message:
        error instanceof ZernioApiError && error.statusCode === 429
          ? "Instagram connection check is busy. Try again shortly."
          : "Instagram connection could not be checked. Try again.",
    }
  }
}
