import { AdminShell, type AdminView } from "@/components/admin/admin-shell"
import {
  getAdminDeals,
  getAdminNews,
  getAdminProducts,
  getAdminSchedule,
  getAdminMetadata,
} from "@/lib/admin/data"
import { requireAdmin } from "@/lib/admin/auth"
import { getCatalogTaxonomy } from "@/lib/catalog-data"

/**
 * The signed-in admin's workspace: the chat with the site agent and the
 * Products and Metadata tabs, with the current hours, catalog, news, and deals their
 * previews, table, and Edit menu build on. Reads cookies, so it renders
 * inside <Suspense>.
 */
export async function AdminWorkspace({
  view = "chat",
  sessionId,
}: {
  view?: AdminView
  sessionId?: Promise<string>
}) {
  await requireAdmin()
  const [id, schedule, taxonomy, products, news, deals, metadata] =
    await Promise.all([
      sessionId,
      getAdminSchedule(),
      getCatalogTaxonomy(),
      getAdminProducts(),
      getAdminNews(),
      getAdminDeals(),
      getAdminMetadata(),
    ])
  return (
    <AdminShell
      key={id ?? "new"}
      initialView={view}
      sessionId={id}
      preview={{ schedule, taxonomy, products, news, deals }}
      metadata={metadata}
    />
  )
}
