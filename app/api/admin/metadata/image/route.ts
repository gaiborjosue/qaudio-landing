import { getAdmin } from "@/lib/admin/auth"
import { metadataImageRoute } from "@/lib/admin/metadata-image"
import { sessionSupabase } from "@/lib/supabase/server"

export async function POST(request: Request) {
  return metadataImageRoute(request, {
    authorize: async () => Boolean(await getAdmin()),
    store: async (bytes) => {
      const path = `uploads/${crypto.randomUUID()}.webp`
      const supabase = await sessionSupabase()
      const { error } = await supabase.storage
        .from("media")
        .upload(path, bytes, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: false,
        })
      if (error) throw new Error("Upload failed.")
      return path
    },
    remove: async (path) => {
      const supabase = await sessionSupabase()
      await supabase.storage.from("media").remove([path])
    },
  })
}
