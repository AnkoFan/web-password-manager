import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const [license, cargoManifest, tauriConfigText, nsisHooks, packageText, packageLockText] = await Promise.all([
  readFile(new URL("../LICENSE", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/windows/nsis-hooks.nsh", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
])

const tauriConfig = JSON.parse(tauriConfigText)
const packageManifest = JSON.parse(packageText)
const packageLock = JSON.parse(packageLockText)
const cargoVersion = cargoManifest.match(/^version = "([^"]+)"$/m)?.[1]

assert.ok(cargoVersion, "Cargo package version must be declared")
assert.equal(packageManifest.version, cargoVersion, "npm and Cargo versions must match")
assert.equal(packageLock.version, cargoVersion, "package-lock root version must match Cargo")
assert.equal(packageLock.packages?.[""]?.version, cargoVersion, "package-lock workspace version must match Cargo")
assert.equal(tauriConfig.version, cargoVersion, "Tauri and Cargo versions must match")

assert.match(license, /^MIT License\r?\n/, "the project license must contain the MIT text")
assert.match(cargoManifest, /^license = "MIT"$/m, "Cargo metadata must use SPDX MIT")
assert.equal(
  tauriConfig.bundle?.licenseFile,
  "../LICENSE",
  "the Windows bundle must include the project license",
)
assert.equal(
  tauriConfig.bundle?.windows?.nsis?.installerHooks,
  "windows/nsis-hooks.nsh",
  "the NSIS safety hooks must remain enabled",
)
assert.match(nsisHooks, /!macro NSIS_HOOK_PREINSTALL/)
assert.match(nsisHooks, /CheckIfAppIsRunning/)
assert.doesNotMatch(nsisHooks, /FileOpen \$9 .*web-password-manager\.exe.* a/)
assert.doesNotMatch(nsisHooks, /SetErrorLevel 32/)
assert.match(nsisHooks, /!macro NSIS_HOOK_PREUNINSTALL/)
assert.match(nsisHooks, /"\/DELETEAPPDATA"/)

console.log("Release configuration check passed.")
