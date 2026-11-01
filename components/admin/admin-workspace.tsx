import { AdminChat } from "@/components/admin/admin-chat"
import { getAdminProducts, getAdminSchedule } from "@/lib/admin/data"
import { requireAdmin } from "@/lib/admin/auth"
import { getCatalogTaxonomy } from "@/lib/catalog-data"

/**
 * The signed-in admin's chat with the site agent, with the current hours,
 * catalog taxonomy, and products its previews build on. Reads cookies, so it
 * renders inside <Suspense>.
 */
export async function AdminWorkspace({
  sessionId,
}: {
  sessionId?: Promise<string>
}) {
  const admin = await requireAdmin()
  const [id, schedule, taxonomy, products] = await Promise.all([
    sessionId,
    getAdminSchedule(),
    getCatalogTaxonomy(),
    getAdminProducts(),
  ])
  return (
    <AdminChat
      key={id ?? "new"}
      sessionId={id}
      email={admin.email}
      preview={{ schedule, taxonomy, products }}
    />
  )
}
