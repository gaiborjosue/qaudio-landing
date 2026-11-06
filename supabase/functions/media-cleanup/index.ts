import { createClient } from "npm:@supabase/supabase-js@2.118.0"
import { cleanupRequest } from "./cleanup.ts"

// A maintenance-only service client. No caller token is stored or reused and
// this function never publishes, edits content, or calls an agent/model.
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
)

Deno.serve((request) =>
  cleanupRequest(request, {
    async claim(token, dryRun) {
      const { data, error } = await client.rpc("claim_media_cleanup", {
        p_token: token,
        p_dry_run: dryRun,
        p_limit: 100,
      })
      if (error) throw new Error("Claim failed")
      return data ?? []
    },
    async remove(bucket, paths) {
      const { error } = await client.storage.from(bucket).remove(paths)
      if (error) throw new Error("Removal failed")
    },
    async complete(token, asset, success) {
      const { error } = await client.rpc("complete_media_cleanup", {
        p_token: token,
        p_bucket: asset.bucket_id,
        p_path: asset.path,
        p_success: success,
      })
      if (error) throw new Error("Completion failed")
    },
  })
)
