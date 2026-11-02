import { AdminShell, type AdminView } from "@/components/admin/admin-shell"
import {
  getAdminDeals,
  getAdminNews,
  getAdminProducts,
  getAdminSchedule,
} from "@/lib/admin/data"
import { requireAdmin } from "@/lib/admin/auth"
import { getCatalogTaxonomy } from "@/lib/catalog-data"

/**
 * The signed-in admin's workspace: the chat with the site agent and the
 * Products tab, with the current hours, catalog, news, and deals their
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
  const admin = await requireAdmin()
  const [id, schedule, taxonomy, products, news, deals] = await Promise.all([
    sessionId,
    getAdminSchedule(),
    getCatalogTaxonomy(),
    getAdminProducts(),
    getAdminNews(),
    getAdminDeals(),
  ])
  return (
    <AdminShell
      key={id ?? "new"}
      initialView={view}
      sessionId={id}
      email={admin.email}
      preview={{ schedule, taxonomy, products, news, deals }}
    />
  )
}
