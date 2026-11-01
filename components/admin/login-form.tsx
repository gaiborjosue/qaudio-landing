"use client"

import { useActionState } from "react"
import {
  requestPasswordReset,
  setPassword,
  signIn,
  type FormState,
} from "@/app/admin/actions"
import styles from "./admin.module.css"

function Status({ state }: { state: FormState }) {
  if (!state) return null
  return "error" in state ? (
    <p className={styles.formError} role="alert">
      {state.error}
    </p>
  ) : (
    <p className={styles.formMessage} role="status">
      {state.message}
    </p>
  )
}

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null)
  return (
    <form className={styles.loginForm} action={action}>
      <label>
        Email
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <Status state={state} />
      <button className={styles.primary} type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  )
}

export function ResetForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null)
  return (
    <details className={styles.reset}>
      <summary>Forgot password?</summary>
      <form className={styles.loginForm} action={action}>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <Status state={state} />
        <button className={styles.secondary} type="submit" disabled={pending}>
          {pending ? "Sending…" : "Email a reset link"}
        </button>
      </form>
    </details>
  )
}

export function SetPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(setPassword, null)
  return (
    <form className={styles.loginForm} action={action}>
      {/* Lets password managers save the new password for this account. */}
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />
      <label>
        New password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={72}
          required
        />
      </label>
      <label>
        Repeat it
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={72}
          required
        />
      </label>
      <Status state={state} />
      <button className={styles.primary} type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  )
}
