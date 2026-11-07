import { readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"

function executable(path) {
  try {
    const stat = statSync(path)
    return stat.isFile() ? { path, modified: stat.mtimeMs } : null
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null
    throw error
  }
}

/** Prepare only this dev process; Eve still owns credentials and refresh. */
export function configureDevModelPath({
  env = process.env,
  platform = process.platform,
} = {}) {
  if (
    platform !== "win32" ||
    env.NODE_ENV !== "development" ||
    env.DEBUG_DEV_MODE !== "true" ||
    !env.LOCALAPPDATA
  )
    return null

  const bin = join(env.LOCALAPPDATA, "OpenAI", "Codex", "bin")
  let entries
  try {
    entries = readdirSync(bin, { withFileTypes: true })
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null
    throw error
  }

  // Desktop updates replace the version directory. Prefer the latest native
  // executable over old PATH entries and the legacy unversioned binary.
  const versions = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => executable(join(bin, entry.name, "codex.exe")))
    .filter(Boolean)
    .sort((a, b) => b.modified - a.modified || a.path.localeCompare(b.path))
  const selected = versions[0]
  if (!selected) return null

  // Windows environment keys are case-insensitive, including an inherited Path.
  const key =
    Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH"
  const directory = dirname(selected.path)
  const rest = (env[key] ?? "")
    .split(";")
    .filter((entry) => entry.toLowerCase() !== directory.toLowerCase())
  env[key] = [directory, ...rest].join(";")
  return selected.path
}
