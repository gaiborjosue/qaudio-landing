import type { Metadata } from "next"
import Image from "next/image"
import { Suspense } from "react"
import { LoginForm, ResetForm } from "@/components/admin/login-form"
import styles from "@/components/admin/admin.module.css"

export const metadata: Metadata = { title: "Sign in" }

type Props = { searchParams: Promise<{ link?: string }> }

export default function AdminLoginPage({ searchParams }: Props) {
  return (
    <main className={styles.login}>
      <Image
        src="/qaudio-logo.svg"
        alt="Q Audio"
        width={60}
        height={73}
        loading="eager"
      />
      <h1>Site admin</h1>
      <Suspense>
        <LinkNotice searchParams={searchParams} />
      </Suspense>
      <LoginForm />
      <ResetForm />
    </main>
  )
}

async function LinkNotice({ searchParams }: Props) {
  const { link } = await searchParams
  if (link !== "expired") return null
  return (
    <p className={styles.formError} role="alert">
      That link has expired or was already used. Request a new one below.
    </p>
  )
}
