import "server-only"
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  unlink,
} from "node:fs/promises"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

// The disk layout belongs to the pinned Eve release, not our site database.
// Fail closed after a Workflow World upgrade until its layout is reviewed.
const LOCAL_WORLD = "@workflow/world-local@5.1.2"
export const LOCAL_CHAT_BUFFER = 3
const RUN_ID = /^wrun_[0-9A-Z]{26}$/
const TRACE_ID = /^[a-f0-9]{32}$/
const TERMINAL = new Set(["completed", "cancelled", "failed"])

type LocalRun = {
  runId: string
  workflowName: string
  status: string
  completedAt?: string
  attributes?: Record<string, string>
}
export type LocalChatCleanupInput = {
  currentSessionId?: string
  endedSessionId?: string
}

export function localChatCleanupEnabled(env = process.env) {
  return env.NODE_ENV === "development" && !env.VERCEL
}

const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException)?.code === "ENOENT"
async function exists(path: string) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (missing(error)) return false
    throw error
  }
}
async function entries(path: string) {
  try {
    return await readdir(path, { withFileTypes: true })
  } catch (error) {
    if (missing(error)) return []
    throw error
  }
}

/** Every component is checked: no junctions, symlinks, or paths outside a fixed root. */
async function checkPath(root: string, target: string) {
  const suffix = relative(root, target)
  if (isAbsolute(suffix) || suffix === ".." || suffix.startsWith(`..${sep}`))
    throw new Error("Local chat cleanup path is outside its data root.")
  let cursor = root
  for (const part of ["", ...suffix.split(sep).filter(Boolean)]) {
    cursor = part ? join(cursor, part) : cursor
    try {
      if ((await lstat(cursor)).isSymbolicLink())
        throw new Error("Local chat cleanup refuses linked paths.")
    } catch (error) {
      if (missing(error)) return
      throw error
    }
  }
}
async function checkTree(root: string, target: string) {
  await checkPath(root, target)
  for (const entry of await entries(target)) {
    if (entry.isSymbolicLink())
      throw new Error("Local chat cleanup refuses linked paths.")
    if (entry.isDirectory()) await checkTree(root, join(target, entry.name))
  }
}
async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8"))
}
async function readRun(workflow: string, id: string): Promise<LocalRun | null> {
  const path = join(workflow, "runs", `${id}.json`)
  await checkPath(workflow, path)
  try {
    const value = await json(path)
    if (
      value.runId !== id ||
      typeof value.status !== "string" ||
      typeof value.workflowName !== "string"
    )
      throw new Error("Unrecognized local workflow record.")
    return value as LocalRun
  } catch (error) {
    if (missing(error)) return null
    throw error
  }
}

/** Acquire a separate pruning lock; never touch Eve's locks for live workflows. */
async function acquireLock(path: string) {
  try {
    return await open(path, "wx")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    try {
      const lock = await json(path)
      if (
        typeof lock.pid !== "number" ||
        !Number.isInteger(lock.pid) ||
        lock.pid <= 0
      )
        return null
      try {
        process.kill(lock.pid, 0)
        return null
      } catch (probe) {
        if ((probe as NodeJS.ErrnoException).code !== "ESRCH") return null
      }
      await unlink(path)
      return await open(path, "wx")
    } catch {
      return null
    }
  }
}

/** Local development only. The caller supplies the app root, never a browser path. */
export async function pruneLocalChatHistory({
  appRoot = process.cwd(),
  env = process.env,
  currentSessionId,
  endedSessionId,
  settleTimeoutMs = 2_000,
}: LocalChatCleanupInput & {
  appRoot?: string
  env?: NodeJS.ProcessEnv
  settleTimeoutMs?: number
} = {}) {
  const empty = { chatsRemoved: 0, runsRemoved: 0, tracesRemoved: 0 }
  if (!localChatCleanupEnabled(env)) return empty
  for (const id of [currentSessionId, endedSessionId])
    if (id !== undefined && !RUN_ID.test(id))
      throw new Error("Invalid local chat ID.")
  const app = await realpath(resolve(appRoot))
  const eve = join(app, ".eve")
  const workflow = join(eve, ".workflow-data")
  const traces = join(eve, "traces", "v1")
  await checkPath(app, workflow)
  await checkPath(app, traces)
  if (!(await exists(join(workflow, "runs")))) return empty
  if (
    (await readFile(join(workflow, "version.txt"), "utf8")).trim() !==
    LOCAL_WORLD
  )
    throw new Error(
      "Review local chat cleanup for this Workflow World version."
    )

  const lockPath = join(eve, "local-chat-retention.lock")
  await checkPath(app, lockPath)
  await mkdir(eve, { recursive: true })
  const lock = await acquireLock(lockPath)
  if (!lock) return empty
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }))
    // end() acknowledges retirement before the Workflow's final write can land.
    // This runs after the action response, never inside the ending workflow.
    if (endedSessionId) {
      const deadline = Date.now() + settleTimeoutMs
      while (Date.now() < deadline) {
        const run = await readRun(workflow, endedSessionId)
        if (!run || TERMINAL.has(run.status)) break
        await delay(50)
      }
    }

    const runs = new Map<string, LocalRun>()
    for (const entry of await entries(join(workflow, "runs"))) {
      const id = entry.name.replace(/\.json$/, "")
      if (!entry.isFile() || !entry.name.endsWith(".json") || !RUN_ID.test(id))
        continue
      const run = await readRun(workflow, id)
      if (run) runs.set(id, run)
    }
    const edges = new Map([...runs.keys()].map((id) => [id, new Set<string>()]))
    const unresolved = new Set<string>()
    for (const run of runs.values()) {
      for (const key of ["$rootRunId", "$parentRunId"]) {
        const linked = run.attributes?.[key]
        if (!linked || linked === run.runId) continue
        if (!runs.has(linked)) {
          unresolved.add(run.runId)
          continue
        }
        edges.get(run.runId)!.add(linked)
        edges.get(linked)!.add(run.runId)
      }
    }

    const seen = new Set<string>()
    const finished: { ids: string[]; ended: number }[] = []
    for (const id of runs.keys()) {
      if (seen.has(id)) continue
      const ids: string[] = []
      const queue = [id]
      while (queue.length) {
        const next = queue.pop()!
        if (seen.has(next)) continue
        seen.add(next)
        ids.push(next)
        queue.push(...edges.get(next)!)
      }
      const roots = ids
        .map((key) => runs.get(key)!)
        .filter(
          (run) =>
            run.workflowName === "workflow//eve//workflowEntry" &&
            run.attributes?.["$eve.type"] === "session" &&
            run.attributes?.["$eve.trigger"] === "channel:eve" &&
            !run.attributes?.["$parentRunId"]
        )
      if (
        !roots.length ||
        ids.some(
          (key) =>
            key === currentSessionId ||
            unresolved.has(key) ||
            !TERMINAL.has(runs.get(key)!.status)
        )
      )
        continue
      const ended = Math.max(
        ...roots.map((run) => Date.parse(run.completedAt ?? ""))
      )
      if (Number.isFinite(ended)) finished.push({ ids, ended })
    }
    finished.sort(
      (a, b) => b.ended - a.ended || b.ids[0].localeCompare(a.ids[0])
    )
    const discard = finished.slice(LOCAL_CHAT_BUFFER)
    const removed = new Set(discard.flatMap((chat) => chat.ids))
    if (!removed.size) return empty

    const targets = new Set<string>()
    async function add(root: string, ...parts: string[]) {
      const target = join(root, ...parts)
      if (target === root) throw new Error("Cannot remove a local data root.")
      await checkPath(root, target)
      if (await exists(target)) targets.add(target)
    }
    const streamIds = async (id: string) => {
      const path = join(workflow, "streams", "runs", `${id}.json`)
      await checkPath(workflow, path)
      try {
        return [
          ...(await readFile(path, "utf8")).matchAll(/strm_[A-Za-z0-9_-]+/g),
        ].map((match) => match[0])
      } catch (error) {
        if (missing(error)) return []
        throw error
      }
    }
    const protectedStreams = new Set<string>()
    for (const id of runs.keys())
      if (!removed.has(id))
        for (const stream of await streamIds(id)) protectedStreams.add(stream)
    for (const id of removed) {
      for (const folder of ["events", "steps"]) await add(workflow, folder, id)
      for (const stream of await streamIds(id))
        if (!protectedStreams.has(stream))
          await add(workflow, "streams", "chunks", stream)
      await add(workflow, "streams", "runs", `${id}.json`)
    }
    for (const folder of ["hooks", "hooks/by-run", "waits"]) {
      await checkPath(workflow, join(workflow, folder))
      for (const entry of await entries(join(workflow, folder))) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue
        const path = join(workflow, folder, entry.name)
        await checkPath(workflow, path)
        const record = await json(path)
        const owner =
          typeof record.runId === "string"
            ? record.runId
            : folder === "hooks/by-run"
              ? entry.name.match(/^(wrun_[0-9A-Z]{26})-/)?.[1]
              : undefined
        if (owner && removed.has(owner)) await add(workflow, folder, entry.name)
      }
    }

    let tracesRemoved = 0
    for (const trace of await entries(traces)) {
      if (!trace.isDirectory() || !TRACE_ID.test(trace.name)) continue
      const associated = new Set<string>()
      for (const run of runs.values())
        if (run.attributes?.["$eve.trace_id"] === trace.name)
          associated.add(run.runId)
      const tracePath = join(traces, trace.name)
      await checkTree(traces, tracePath)
      for (const span of await entries(join(tracePath, "segments"))) {
        if (!span.isFile() || !span.name.endsWith(".json")) continue
        const raw = await readFile(
          join(tracePath, "segments", span.name),
          "utf8"
        )
        for (const match of raw.matchAll(
          /"stringValue"\s*:\s*"(wrun_[0-9A-Z]{26})"/g
        ))
          associated.add(match[1])
      }
      if (associated.size && [...associated].every((id) => removed.has(id))) {
        await add(traces, trace.name)
        tracesRemoved++
      }
    }

    // Validate the full deletion set before removing anything. Only terminal
    // runs can be discarded; keep their metadata until all assets are removed,
    // so an interrupted cleanup remains retryable on the next new chat.
    for (const target of targets) {
      const root = target.startsWith(workflow + sep) ? workflow : traces
      if ((await lstat(target)).isDirectory()) await checkTree(root, target)
      else await checkPath(root, target)
    }
    for (const id of removed) {
      const run = await readRun(workflow, id)
      if (!run || !TERMINAL.has(run.status))
        throw new Error("Local chat changed during cleanup.")
    }
    for (const target of targets)
      await rm(target, { recursive: true, force: true })
    for (const id of removed)
      await rm(join(workflow, "runs", `${id}.json`), { force: true })
    return {
      chatsRemoved: discard.length,
      runsRemoved: removed.size,
      tracesRemoved,
    }
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}
