"use client"

import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react"
import Image from "next/image"
import { LayoutGroup, MotionConfig, motion } from "motion/react"
import { LogOut } from "lucide-react"
import { signOut } from "@/app/admin/actions"
import { AdminChat } from "@/components/admin/admin-chat"
import type { PreviewData } from "@/components/admin/change-preview"
import {
  ProductsView,
  type ProductRequest,
  type ProductSheet,
} from "@/components/admin/products-view"
import styles from "./admin.module.css"

export type AdminView = "chat" | "products"

const VIEWS: { id: AdminView; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "products", label: "Products" },
]

// Next patches history; going around it keeps the workspace mounted while
// the address follows the view and the chat's session.
function setAddress(path: string) {
  if (window.location.pathname === path) return
  History.prototype.replaceState.call(
    window.history,
    window.history.state,
    "",
    path
  )
}

/**
 * The admin workspace: a header with the logo and Tune on the left, the
 * Chat / Products switch in the middle, and chat/sign-out actions on the right, over
 * the chat with Tune or the Products tab. Both stay mounted, so switching
 * keeps the conversation and the table's filters and unsaved changes. The
 * address follows along (/admin or /admin/s/<session>, and
 * /admin/products), so a reload opens the same view.
 */
export function AdminShell({
  initialView,
  sessionId,
  preview,
}: {
  initialView: AdminView
  sessionId?: string
  /** Current site data the chat's previews and the Products tab build on. */
  preview: PreviewData
}) {
  const id = useId()
  const [view, setView] = useState(initialView)
  const current = useRef(initialView)
  const session = useRef(sessionId)
  // Where the chat puts its New chat button, beside the account.
  const [chatActions, setChatActions] = useState<HTMLDivElement | null>(null)
  const [sheet, setSheet] = useState<ProductSheet | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const address = (next: AdminView) =>
    next === "products"
      ? "/admin/products"
      : session.current
        ? `/admin/s/${encodeURIComponent(session.current)}`
        : "/admin"

  const show = (next: AdminView) => {
    current.current = next
    setView(next)
    setAddress(address(next))
  }

  // Stable, so the chat's agent can hold on to it.
  const onSession = useCallback((next?: string) => {
    session.current = next
    if (current.current === "chat") {
      setAddress(next ? `/admin/s/${encodeURIComponent(next)}` : "/admin")
    }
  }, [])

  // The chat's quick menus open products here instead of asking Tune.
  const openProduct = (request: ProductRequest) => {
    show("products")
    if (request.mode === "delete") {
      setSheet(null)
      setDeleting(request.id)
    } else {
      setDeleting(null)
      setSheet(request)
    }
  }

  const tabId = (view: AdminView) => `${id}-tab-${view}`
  const panelId = (view: AdminView) => `${id}-panel-${view}`

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.app}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <Image
              src="/qaudio-logo.svg"
              alt="Q Audio"
              width={30}
              height={36}
              loading="eager"
            />
            <h1>Tune</h1>
          </div>
          <ViewSwitch
            view={view}
            onChange={show}
            tabId={tabId}
            panelId={panelId}
            group={id}
          />
          <div className={styles.account}>
            <div
              ref={setChatActions}
              className={styles.chatActions}
              hidden={view !== "chat"}
            />
            <form action={signOut}>
              <button type="submit" className={styles.quiet}>
                <LogOut size={15} aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </header>

        <div
          id={panelId("chat")}
          role="tabpanel"
          aria-labelledby={tabId("chat")}
          className={styles.panel}
          hidden={view !== "chat"}
        >
          <AdminChat
            active={view === "chat"}
            sessionId={sessionId}
            preview={preview}
            actionsTarget={chatActions}
            onSession={onSession}
            onProduct={openProduct}
          />
        </div>
        <div
          id={panelId("products")}
          role="tabpanel"
          aria-labelledby={tabId("products")}
          className={`${styles.panel} ${styles.productsPanel}`}
          hidden={view !== "products"}
        >
          <ProductsView
            products={preview.products}
            taxonomy={preview.taxonomy}
            active={view === "products"}
            sheet={sheet}
            onSheet={setSheet}
            deleting={deleting}
            onDeleting={setDeleting}
          />
        </div>
      </div>
    </MotionConfig>
  )
}

/**
 * Chat / Products: a pill switch, built as tabs. Arrow keys, Home, and End
 * move between them; the dark pill slides to the chosen one (instant under
 * reduced motion).
 */
function ViewSwitch({
  view,
  onChange,
  tabId,
  panelId,
  group,
}: {
  view: AdminView
  onChange: (view: AdminView) => void
  tabId: (view: AdminView) => string
  panelId: (view: AdminView) => string
  group: string
}) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = VIEWS.length - 1
    const to =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null
    if (to === null) return
    event.preventDefault()
    onChange(VIEWS[to].id)
    tabs.current[to]?.focus()
  }

  return (
    <LayoutGroup id={group}>
      <div className={styles.switch} role="tablist" aria-label="Workspace">
        {VIEWS.map((item, index) => {
          const selected = item.id === view
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabs.current[index] = node
              }}
              type="button"
              role="tab"
              id={tabId(item.id)}
              aria-selected={selected}
              aria-controls={panelId(item.id)}
              tabIndex={selected ? 0 : -1}
              className={styles.switchTab}
              onClick={() => onChange(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {selected && (
                <motion.span
                  layoutId="view-pill"
                  className={styles.switchPill}
                  transition={{ type: "spring", stiffness: 520, damping: 40 }}
                />
              )}
              <span className={styles.switchLabel}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </LayoutGroup>
  )
}
