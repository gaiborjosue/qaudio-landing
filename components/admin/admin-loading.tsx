import styles from "./admin.module.css"

export function AdminLoading() {
  return (
    <p className={styles.loading} role="status">
      Loading…
    </p>
  )
}
