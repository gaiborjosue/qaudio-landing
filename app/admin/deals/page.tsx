import { Suspense } from "react"
import { AdminWorkspace } from "@/components/admin/admin-workspace"
import { AdminLoading } from "@/components/admin/admin-loading"

/** The workspace opened on its Deals tab. */
export default function AdminDealsPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminWorkspace view="deals" />
    </Suspense>
  )
}
