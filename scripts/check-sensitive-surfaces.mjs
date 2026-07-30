import { existsSync, readFileSync, readdirSync } from "node:fs"
import { extname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const findings = []

function filesUnder(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

function report(path, rule) {
  findings.push(`${relative(root, path)}: ${rule}`)
}

const productionFrontend = filesUnder(join(root, "src")).filter(
  (path) =>
    [".ts", ".tsx"].includes(extname(path)) &&
    !path.endsWith(".test.ts") &&
    !path.endsWith(".test.tsx") &&
    !path.endsWith("vault-browser-prototype.ts"),
)

const forbiddenFrontendPatterns = [
  [/\blocalStorage\b/, "production frontend must not use localStorage"],
  [/\bsessionStorage\b/, "production frontend must not use sessionStorage"],
  [/\bindexedDB\b/, "production frontend must not use IndexedDB"],
  [/\bdangerouslySetInnerHTML\b/, "production frontend must not inject raw HTML"],
  [/\bnavigator\.clipboard\b/, "production frontend must not access the clipboard directly"],
  [/\bconsole\.(?:debug|info|log|warn|error)\b/, "production frontend must not log runtime data"],
  [
    /@tauri-apps\/plugin-clipboard-manager/,
    "production frontend must not import the clipboard plugin",
  ],
]

for (const path of productionFrontend) {
  const source = readFileSync(path, "utf8")
  for (const [pattern, rule] of forbiddenFrontendPatterns) {
    if (pattern.test(source)) report(path, rule)
  }
}

const tauriConfigPath = join(root, "src-tauri", "tauri.conf.json")
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"))
const csp = tauriConfig?.app?.security?.csp
if (typeof csp !== "string" || !csp.includes("default-src 'self'")) {
  report(tauriConfigPath, "CSP must default to self")
}
if (typeof csp !== "string" || !csp.includes("connect-src ipc: http://ipc.localhost")) {
  report(tauriConfigPath, "CSP must restrict network connections to Tauri IPC")
}
if (typeof csp === "string" && /script-src[^;]*(?:'unsafe-eval'|'unsafe-inline')/.test(csp)) {
  report(tauriConfigPath, "CSP must not allow unsafe script execution")
}

const capabilityPath = join(root, "src-tauri", "capabilities", "default.json")
const capability = JSON.parse(readFileSync(capabilityPath, "utf8"))
const permissions = Array.isArray(capability.permissions) ? capability.permissions : []
for (const permission of permissions) {
  const identifier = typeof permission === "string" ? permission : permission?.identifier
  if (
    typeof identifier === "string" &&
    /(?:clipboard|shell|process|global-shortcut|http|upload|download)/i.test(identifier)
  ) {
    report(capabilityPath, `unexpected privileged capability: ${identifier}`)
  }
}

const opener = permissions.find(
  (permission) =>
    typeof permission === "object" && permission?.identifier === "opener:allow-open-url",
)
const allowedUrls = opener?.allow?.map((entry) => entry?.url).filter(Boolean) ?? []
if (
  allowedUrls.length !== 2 ||
  !allowedUrls.includes("https://*") ||
  !allowedUrls.includes("http://*")
) {
  report(capabilityPath, "URL opener must allow only HTTP and HTTPS")
}

const bundlePatterns = [
  [/\blocalStorage\b/, "bundle contains localStorage"],
  [/\bsessionStorage\b/, "bundle contains sessionStorage"],
  [/\bindexedDB\b/, "bundle contains IndexedDB"],
  [/\bnavigator\.clipboard\b/, "bundle contains direct clipboard access"],
  [/fictional-(?:m25-)?secret/i, "bundle contains a test secret marker"],
  [/\bmockPassword\b/, "bundle contains the browser prototype password state"],
]

for (const path of filesUnder(join(root, "dist")).filter((file) =>
  [".html", ".js"].includes(extname(file)),
)) {
  const bundle = readFileSync(path, "utf8")
  for (const [pattern, rule] of bundlePatterns) {
    if (pattern.test(bundle)) report(path, rule)
  }
}

if (findings.length > 0) {
  console.error("Sensitive-surface check failed:")
  for (const finding of findings) console.error(`- ${finding}`)
  process.exit(1)
}

console.log("Sensitive-surface and production bundle checks passed.")
