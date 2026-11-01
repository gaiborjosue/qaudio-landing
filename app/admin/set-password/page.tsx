import type { Metadata } from "next"
import Image from "next/image"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { AdminLoading } from "@/components/admin/admin-loading"
import { SetPasswordForm } from "@/components/admin/login-form"
import styles from "@/components/admin/admin.module.css"
import { sessionSupabase } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Set password" }

/** Reached from a reset or invite email link (through /auth/confirm). */
export default function SetPasswordPage() {
  return (
    <main className={styles.login}>
      <Image
        src="/qaudio-logo.svg"
        alt="Q Audio"
        width={60}
        height={73}
        loading="eager"
      />
      <h1>Set your password</h1>
      <Suspense fallback={<AdminLoading />}>
        <SignedInForm />
      </Suspense>
    </main>
  )
}

async function SignedInForm() {
  const supabase = await sessionSupabase()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims) redirect("/admin/login")
  return (
    <SetPasswordForm
      email={typeof claims.email === "string" ? claims.email : ""}
    />
  )
}
