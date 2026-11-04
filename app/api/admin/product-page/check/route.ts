import { getAdmin } from "@/lib/admin/auth"
import { productPageCheckRoute } from "@/lib/admin/product-page"

/** Whether the product form's manufacturer page answers. */
export async function POST(request: Request) {
  return productPageCheckRoute(request, {
    authorize: async () => Boolean(await getAdmin()),
  })
}
