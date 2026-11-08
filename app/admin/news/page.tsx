import { Suspense } from "react"
import { AdminWorkspace } from "@/components/admin/admin-workspace"
import { AdminLoading } from "@/components/admin/admin-loading"

export default function AdminNewsPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminWorkspace view="news" />
    </Suspense>
  )
}
