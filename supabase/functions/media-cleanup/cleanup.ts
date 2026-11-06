type Asset = { bucket_id: string; path: string }
export type CleanupStore = {
  claim: (token: string, dryRun: boolean) => Promise<Asset[]>
  remove: (bucket: string, paths: string[]) => Promise<void>
  complete: (token: string, asset: Asset, success: boolean) => Promise<void>
}

/** All authorization and atomic claims happen in the service-only database RPC. */
export async function cleanupRequest(request: Request, store: CleanupStore) {
  const reply = (body: object, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
  if (request.method !== "POST")
    return reply({ error: "Method not allowed" }, 405)
  const token = /^Bearer ([a-f0-9]{64})$/.exec(
    request.headers.get("authorization") ?? ""
  )?.[1]
  if (!token) return reply({ error: "Unauthorized" }, 401)
  if (Number(request.headers.get("content-length")) > 1024)
    return reply({ error: "Invalid request" }, 400)
  let dryRun = true
  try {
    const body = await request.text()
    if (body.length > 1024) return reply({ error: "Invalid request" }, 400)
    const input = JSON.parse(body || "{}")
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      (input.dryRun !== undefined && typeof input.dryRun !== "boolean")
    )
      return reply({ error: "Invalid request" }, 400)
    dryRun = input.dryRun !== false
  } catch {
    return reply({ error: "Invalid request" }, 400)
  }
  let assets: Asset[]
  try {
    assets = await store.claim(token, dryRun)
  } catch {
    return reply({ error: "Cleanup authorization or claim failed" }, 403)
  }
  if (dryRun)
    return reply({ dryRun, eligible: assets.length, deleted: 0, failed: 0 })
  let deleted = 0,
    failed = 0
  for (const bucket of new Set(assets.map((a) => a.bucket_id))) {
    const group = assets.filter((a) => a.bucket_id === bucket)
    let success = true
    try {
      await store.remove(
        bucket,
        group.map((a) => a.path)
      )
    } catch {
      success = false
    }
    for (const asset of group) {
      try {
        await store.complete(token, asset, success)
        if (success) deleted++
        else failed++
      } catch {
        failed++
      }
    }
  }
  return reply(
    { dryRun, eligible: assets.length, deleted, failed },
    failed ? 503 : 200
  )
}
