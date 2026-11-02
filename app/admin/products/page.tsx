import { Suspense } from "react"
import { AdminWorkspace } from "@/components/admin/admin-workspace"
import { AdminLoading } from "@/components/admin/admin-loading"

/** The workspace opened on its Products tab. */
export default function AdminProductsPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminWorkspace view="products" />
    </Suspense>
  )
}
