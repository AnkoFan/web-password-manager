import { readFileSync, readdirSync } from "node:fs"
import { extname, join, relative } from "node:path"

const root = process.cwd()
const violations = []

function sourceFiles(directory, extensions) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path, extensions)
    return extensions.has(extname(entry.name)) ? [path] : []
  })
}

function reject(path, pattern, message) {
  const source = readFileSync(path, "utf8")
  if (pattern.test(source)) violations.push(`${relative(root, path)}: ${message}`)
}

for (const path of sourceFiles(join(root, "src", "components", "ui"), new Set([".ts", ".tsx"]))) {
  reject(path, /from\s+["']@\/(?:features|services|app)\//, "基础 UI 组件不能依赖业务模块")
}

for (const path of sourceFiles(join(root, "src", "services"), new Set([".ts", ".tsx"]))) {
  reject(path, /from\s+["']@\/(?:features|app)\//, "前端服务不能依赖页面或应用层")
}

reject(
  join(root, "src-tauri", "src", "storage.rs"),
  /#\[tauri::command\]|\bState\s*</,
  "存储模块不能定义桌面命令或持有界面状态",
)

if (violations.length > 0) {
  console.error(violations.join("\n"))
  process.exit(1)
}

console.log("Architecture dependency check passed.")
