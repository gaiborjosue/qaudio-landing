"use client"

import { useCallback, useSyncExternalStore } from "react"
import { Workflow } from "lucide-react"
import { CreateMenu } from "@/components/ui/create-menu"
import {
  DEFAULT_FLOW_SETTINGS,
  FLOWS,
  parseFlowSettings,
  type FlowId,
  type FlowSettings,
} from "@/lib/admin/flows"
import styles from "./admin.module.css"

// Which flows are on, kept in this browser (every one is on until turned
// off). The chat sends them with each message (admin-chat.tsx).
const KEY = "tune:flows"
const listeners = new Set<() => void>()
let cached: { raw: string | null; settings: FlowSettings } | null = null
// Where they're kept for this page when storage is blocked.
let fallback: string | null = null

function stored() {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return fallback
  }
}

function read(): FlowSettings {
  const raw = stored()
  if (!cached || cached.raw !== raw) {
    let saved: unknown = null
    try {
      saved = raw ? JSON.parse(raw) : null
    } catch {
      saved = null
    }
    cached = { raw, settings: parseFlowSettings(saved) }
  }
  return cached.settings
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Another tab changing them changes them here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function useFlowSettings() {
  const settings = useSyncExternalStore(
    subscribe,
    read,
    () => DEFAULT_FLOW_SETTINGS
  )
  const setFlow = useCallback((id: FlowId, on: boolean) => {
    const next = JSON.stringify({ ...read(), [id]: on })
    try {
      window.localStorage.setItem(KEY, next)
    } catch {
      fallback = next
    }
    for (const listener of listeners) listener()
  }, [])
  return [settings, setFlow] as const
}

// 34px rows with a second line, 2px apart, in the panel's 12px padding.
const ROW = 52
const panelHeight = 24 + FLOWS.length * ROW + (FLOWS.length - 1) * 2

/**
 * The Flows pill, beside Create and Edit: a switch for each flow, all on by
 * default. With one on, Tune runs it when a request matches; off, it does
 * only what's asked.
 */
export function FlowsMenu({
  settings,
  onChange,
  disabled,
  panelWidth,
}: {
  settings: FlowSettings
  onChange: (id: FlowId, on: boolean) => void
  disabled: boolean
  panelWidth: number
}) {
  const on = FLOWS.filter((flow) => settings[flow.id]).length
  return (
    <CreateMenu
      items={[]}
      label="Flows"
      // Each flow has its own switch, so the pill says how many are on
      // only to assistive technology, after its visible name.
      pillLabel={`Flows, ${on} of ${FLOWS.length} on`}
      icon={Workflow}
      side="top"
      disabled={disabled}
      panelWidth={panelWidth}
      panel={{
        height: panelHeight,
        render: () => (
          <ul className={styles.flowSwitches} aria-label="Flows">
            {FLOWS.map((flow) => (
              <li key={flow.id}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings[flow.id]}
                  onClick={() => onChange(flow.id, !settings[flow.id])}
                >
                  <span className={styles.flowText}>
                    <span className={styles.flowName}>{flow.name}</span>
                    <span className={styles.flowSummary}>{flow.summary}</span>
                  </span>
                  <span className={styles.flowSwitch} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ),
      }}
    />
  )
}
