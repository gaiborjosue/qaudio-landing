import { getAdmin } from "@/lib/admin/auth"
import { productPagePrefillRoute } from "@/lib/admin/product-page"
import { draftProductFromPage } from "@/lib/admin/product-prefill"
import { getCatalogTaxonomy } from "@/lib/catalog-data"
import { sessionSupabase } from "@/lib/supabase/server"

/**
 * Prefill with Tune: reads a manufacturer's page (Tavily) and suggests the
 * product form's fields and photos. Photos are staged in uploads/ as the
 * signed-in admin (RLS), like the form's own uploads; nothing else is saved.
 */
export async function POST(request: Request) {
  return productPagePrefillRoute(request, {
    admin: getAdmin,
    apiKey: process.env.TAVILY_API_KEY,
    taxonomy: getCatalogTaxonomy,
    draft: draftProductFromPage,
    store: {
      async upload(path, data) {
        const supabase = await sessionSupabase()
        const { error } = await supabase.storage
          .from("media")
          .upload(path, data, {
            contentType: "image/webp",
            // Names never repeat, so a year's cache is safe.
            cacheControl: "31536000",
            upsert: false,
          })
        if (error) throw new Error("Upload failed.")
      },
      async discard(paths) {
        if (!paths.length) return
        const supabase = await sessionSupabase()
        await supabase.storage.from("media").remove(paths)
      },
    },
  })
}
