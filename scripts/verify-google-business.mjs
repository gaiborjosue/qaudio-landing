// Explicitly GET-only live diagnostic. No model calls, uploads or writes.
// Run: node --env-file=.env --env-file=.env.local scripts/verify-google-business.mjs
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith(".") &&
      context.parentURL?.endsWith(".ts") &&
      !/\.[a-z]+$/i.test(specifier)
    ) {
      const candidate = fileURLToPath(
        new URL(`${specifier}.ts`, context.parentURL)
      )
      if (existsSync(candidate))
        return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
    return next(specifier, context)
  },
})
const { readZernioConfig } = await import("../lib/admin/zernio-api.ts")
const {
  zernioGoogleBusinessStatus,
  readGoogleBusinessLocation,
  listGoogleBusinessPosts,
} = await import("../lib/admin/google-business-api.ts")
const config = readZernioConfig()
const methods = new Set()
const getOnly = async (request) => {
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== "https://zernio.com"
  )
    throw new Error("Diagnostic blocked a non-GET or unexpected origin.")
  methods.add(request.method)
  return fetch(request)
}
const status = await zernioGoogleBusinessStatus(config, getOnly)
console.log(
  `Google Business connection: ${status.state}; connected accounts: ${status.accounts.length}; needs attention: ${Boolean(status.needsAttention)}`
)
if (!config || status.state !== "connected") process.exitCode = 1
else
  for (const account of status.accounts) {
    try {
      const location = await readGoogleBusinessLocation(
        config,
        account.id,
        getOnly
      )
      const posts = await listGoogleBusinessPosts(
        config,
        location.target,
        undefined,
        5,
        getOnly
      )
      console.log(
        `${location.target.business}: verified=${location.verified ?? "unknown"}; regular periods=${location.hours.regularHours.periods.length}; special periods=${location.hours.specialHours.specialHourPeriods.length}; scoped posts in latest 5=${posts.posts.length}`
      )
    } catch {
      console.log(
        "Selected location or posts could not be read; no changes sent."
      )
      process.exitCode = 1
    }
  }
console.log(
  `HTTP methods used: ${[...methods].join(", ") || "none"}. No writes or uploads.`
)
