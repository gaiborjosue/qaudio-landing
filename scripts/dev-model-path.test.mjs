import assert from "node:assert/strict"
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  utimesSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import test from "node:test"
import { configureDevModelPath } from "./dev-model-path.mjs"

function installation(t) {
  const parent = resolve(tmpdir())
  const root = mkdtempSync(join(parent, "qaudio-dev-model-"))
  t.after(() => {
    assert.equal(dirname(resolve(root)), parent)
    assert.match(basename(root), /^qaudio-dev-model-/)
    rmSync(root, { recursive: true, force: true })
  })
  const bin = join(root, "OpenAI", "Codex", "bin")
  function add(version, modified) {
    const path = join(bin, version, "codex.exe")
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, "fixture; never executed")
    utimesSync(path, modified, modified)
    return path
  }
  const env = {
    LOCALAPPDATA: root,
    NODE_ENV: "development",
    DEBUG_DEV_MODE: "true",
    Path: "missing-version;system-tools",
  }
  return { bin, add, env }
}

test("replaces stale version discovery with the newest installed native CLI", (t) => {
  const { add, env, bin } = installation(t)
  add("", 3000) // Legacy unversioned binary must not displace a versioned one.
  const older = add("old-version", 1000)
  const current = add("new-version", 2000)
  mkdirSync(join(bin, "incomplete-update"))
  env.Path = `${dirname(older)};system-tools`

  assert.equal(configureDevModelPath({ env, platform: "win32" }), current)
  assert.equal(env.Path, `${dirname(current)};${dirname(older)};system-tools`)
  assert.equal(Object.hasOwn(env, "PATH"), false)
  assert.equal(configureDevModelPath({ env, platform: "win32" }), current)
  assert.equal(
    env.Path.split(";").filter((p) => p === dirname(current)).length,
    1
  )

  const updated = add("next-update", 4000)
  assert.equal(configureDevModelPath({ env, platform: "win32" }), updated)
  assert.equal(env.Path.split(";")[0], dirname(updated))
})

test("a legacy unversioned desktop binary does not override another CLI or Eve login", (t) => {
  const { add, env } = installation(t)
  add("", 1000)
  const before = { ...env }
  assert.equal(configureDevModelPath({ env, platform: "win32" }), null)
  assert.deepEqual(env, before)
})

test("leaves PATH and Eve's own login alone without a desktop installation", (t) => {
  const { env } = installation(t)
  const before = { ...env }
  assert.equal(configureDevModelPath({ env, platform: "win32" }), null)
  assert.deepEqual(env, before)
})

test("does nothing outside Windows development with an exact opt-in", (t) => {
  const { add, env } = installation(t)
  add("current", 1000)
  for (const flag of [undefined, "false", "TRUE", "1", "true true"]) {
    const candidate = { ...env, DEBUG_DEV_MODE: flag }
    const before = { ...candidate }
    assert.equal(
      configureDevModelPath({ env: candidate, platform: "win32" }),
      null
    )
    assert.deepEqual(candidate, before)
  }
  for (const mode of [undefined, "production", "test"]) {
    const candidate = { ...env, NODE_ENV: mode }
    const before = { ...candidate }
    assert.equal(
      configureDevModelPath({ env: candidate, platform: "win32" }),
      null
    )
    assert.deepEqual(candidate, before)
  }
  for (const platform of ["darwin", "linux"]) {
    const candidate = { ...env }
    assert.equal(configureDevModelPath({ env: candidate, platform }), null)
    assert.deepEqual(candidate, env)
  }
})
