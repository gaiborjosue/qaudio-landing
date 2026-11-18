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
import { redirect } from "next/navigation"
import { readCurrentChat } from "@/lib/admin/current-chat"
import { sessionSupabase } from "@/lib/supabase/server"
import { toStoreDateTime } from "@/lib/admin/store-time"

/**
 * The signed-in admin's workspace: the chat with the site agent and the
 * News, Products, Deals, and Metadata tabs, with the current hours, catalog,
 * news, and deals their previews, tables, and Edit menu build on. Reads
 * cookies, so it renders inside <Suspense>.
 */
export async function AdminWorkspace({
  view = "chat",
  sessionId,
}: {
  view?: AdminView
  sessionId?: Promise<string>
}) {
  const admin = await requireAdmin()
  const [
    requestedId,
    savedChat,
    schedule,
    taxonomy,
    products,
    news,
    deals,
    metadata,
  ] = await Promise.all([
    sessionId,
    readCurrentChat(await sessionSupabase(), admin.id).then(
      (chat) => ({ chat, failed: false }),
      () => ({ chat: null, failed: true })
    ),
    getAdminSchedule(),
    getCatalogTaxonomy(),
    getAdminProducts(),
    getAdminNews(),
    getAdminDeals(),
    getAdminMetadata(),
  ])
  const currentChat = savedChat.chat
  if (!requestedId && view === "chat" && currentChat?.session_id)
    redirect(`/admin/s/${encodeURIComponent(currentChat.session_id)}`)
  const id = requestedId ?? currentChat?.session_id ?? undefined
  return (
    <AdminShell
      key={id ?? "new"}
      initialView={view}
      sessionId={id}
      chatGeneration={
        !requestedId || requestedId === currentChat?.session_id
          ? (currentChat?.generation ?? null)
          : null
      }
      chatRestoreFailed={savedChat.failed && !requestedId}
      preview={{ schedule, taxonomy, products, news, deals }}
      metadata={metadata}
      newsNow={toStoreDateTime(new Date())}
    />
  )
}
