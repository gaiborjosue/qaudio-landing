import { readZernioConfig } from "../../lib/admin/zernio-api"
import {
  ACCESS_TOKEN_ATTRIBUTE,
  verifyAdminToken,
  type CallerContext,
} from "./supabase"

/** Zernio bypasses RLS: every Google Business tool verifies the admin itself. */
export async function googleBusinessAccess(ctx: CallerContext) {
  const caller = ctx.session.auth.current
  const token = caller?.attributes[ACCESS_TOKEN_ATTRIBUTE]
  if (caller?.principalType !== "user" || typeof token !== "string")
    throw new Error("Google Business requires a signed-in site admin.")
  const admin = await verifyAdminToken(token)
  if (admin === "invalid" || admin === "forbidden")
    throw new Error(
      admin === "forbidden"
        ? "Only site admins can use Google Business."
        : "The admin session expired. Send a new message to refresh it."
    )
  const config = readZernioConfig()
  if (!config)
    throw new Error("Google Business isn't configured in Zernio on this site.")
  return config
}
