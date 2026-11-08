import { spawn } from "node:child_process"
import { createRequire } from "node:module"

// Storefront/API smoke checks do not need a running agent. Next's documented
// external-origin mode prevents its built Eve process from opening or resuming
// the owner's development chat history. No request is made to this origin by
// check-launch; full agent acceptance happens on the hosted demo.
const require = createRequire(import.meta.url)
console.log(
  "Starting the production storefront for launch checks; agent transport is disabled."
)
const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "start", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, EVE_NEXT_PRODUCTION_ORIGIN: "http://127.0.0.1:9" },
  }
)
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal))
child.on("error", (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on("exit", (code) => {
  process.exitCode = code ?? 1
})
