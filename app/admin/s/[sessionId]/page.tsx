import { Suspense } from "react"
import { AdminWorkspace } from "@/components/admin/admin-workspace"
import { AdminLoading } from "@/components/admin/admin-loading"

type Props = { params: Promise<{ sessionId: string }> }

/** A saved conversation, including a reply or approval still in progress. */
export default function AdminSessionPage({ params }: Props) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminWorkspace sessionId={params.then(({ sessionId }) => sessionId)} />
    </Suspense>
  )
}
