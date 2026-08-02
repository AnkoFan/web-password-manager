# 技术栈选择

> 用途说明：记录桌面框架、前后端语言、数据库、安全库、界面组件、测试和 Windows 打包技术的选择与理由。
>
> 状态：现行 Windows 技术栈 / 已按 M3 实现更新
>
> 最后更新日期：2026-07-30

## 1. 选型结论

| 层级 | 选择 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 后端与核心 | Rust 当前稳定版 |
| 前端 | React 19 + TypeScript 严格模式 |
| 构建工具 | Vite 当前稳定版 |
| 样式 | Tailwind CSS 4 + CSS 设计令牌 |
| 组件基础 | shadcn/ui 源码组件，按需引入 |
| 图标 | Lucide，按需引入 |
| 数据库 | SQLite + SQLCipher |
| Rust 数据访问 | `rusqlite` 或经验证的等价绑定 |
| 数据库密钥生成 | Windows CSPRNG |
| 数据库密钥保护 | Windows 当前用户 DPAPI |
| 序列化 | Serde |
| Rust 错误 | `thiserror`，应用边界映射稳定错误码 |
| 日志 | `tracing`，默认脱敏 |
| 前端测试 | Vitest + Testing Library |
| Rust 测试 | `cargo test` |
| 端到端测试 | Tauri/Windows 可用的 WebDriver 或受控 UI 测试方案 |
| Windows 安装器 | Tauri NSIS `Setup.exe` |
| 包管理 | npm，提交锁文件 |

准确的补丁版本在创建项目时选择当日稳定版，并通过锁文件和 `rust-toolchain.toml` 固定。

## 2. 为什么选择 Tauri

### 优点

- 使用 Rust 实现安全、数据库和平台能力。
- 前端使用成熟 Web UI 技术，便于快速制作高质量界面。
- 可以生成 Windows NSIS `-setup.exe`。
- 不需要自带完整 Chromium，通常比 Electron 更轻。
- Tauri 2 提供命令与权限边界，适合限制前端能力。
- 不需要本地 HTTP 服务器。

### 代价

- Windows 使用 WebView2，需要处理运行时安装模式。
- Rust、原生 SQLCipher 和 Windows 打包增加构建复杂度。
- WebView 与 Rust 之间的 IPC 必须限制，不能暴露万能命令。
- 安全敏感字符串可能经过前端，需要减少其范围和生命周期。

### 结论

Tauri 与“一个安装程序、完全本地、Rust 保管密钥、模块化前端”的目标最匹配。先通过 SQLCipher 和安装器原型再冻结。

## 3. 为什么不选择 Electron

Electron 生态成熟，但当前项目不优先采用：

- 安装体积和运行内存通常更大。
- 前后端都在 JavaScript 生态中，密钥边界不如 Rust 后端清晰。
- 需要更严格地限制 Node 和渲染进程能力。

如果 Tauri + SQLCipher 在 Windows 上无法可靠构建或分发，Electron 才作为备选重新评估，不能同时维护两套桌面框架。

## 4. 为什么不选择纯 .NET

.NET 和 WinUI/WPF 对 Windows 集成很好，也可实现安全本地应用，但当前项目长期保留跨平台可能性，并希望界面迭代效率较高，因此选择 Tauri。

若长期确定只支持 Windows，并且 WebView2 或 Tauri 成为主要风险，可以重新评估 .NET。该决策需要 ADR。

## 5. 前端

### 5.1 React 19

- 采用 React 当前稳定主版本。
- 只构建本地客户端界面，不使用 React Server Components。
- 不引入 Next.js 或服务端渲染。
- 使用函数组件和模块局部状态。

### 5.2 TypeScript

- 开启严格模式。
- 禁止使用 `any` 绕过敏感 IPC 类型。
- Tauri 命令请求和响应具有明确类型。
- 运行时仍由 Rust 后端验证所有输入。

### 5.3 状态管理

MVP 不引入 Redux 等全局状态框架：

- React Context 保存只读保险库启动摘要。
- 模块局部使用 reducer 或 hooks。
- 数据通过应用服务 hooks 获取。
- 数据库密钥不进入前端或全局状态。
- 对象切换、组件卸载和应用退出集中清理临时敏感状态。

如果状态复杂度实际超过阈值，再通过 ADR 选择轻量状态库。

### 5.4 路由

使用 React Router 或小型显式路由：

- `/categories`
- `/categories/:categoryId`
- `/websites/:websiteId`
- `/search`
- `/trash`
- `/settings`

路由只负责界面导航，Rust 中已验证的 SQLCipher 连接仍是业务命令的最终门控。

## 6. 样式与组件

### 6.1 Tailwind CSS 4

- 使用 CSS 变量定义颜色、间距、圆角和阴影。
- 组件样式通过受控令牌保持一致。
- 不在 JSX 中堆积无法维护的任意值。
- 只使用目标 WebView2 支持的 CSS 特性。

### 6.2 shadcn/ui

- 按需将组件源码加入项目，不安装庞大黑盒组件包。
- 首批仅需要 Button、Input、Dialog、Dropdown Menu、Tabs、Tooltip、Toast、Scroll Area 和 Separator。
- 所有组件经过键盘、焦点和敏感值展示审查。
- 不使用远程 CDN 或运行时拉取组件。

### 6.3 图标

- 使用 Lucide。
- 图标配合文本或无障碍名称，不单独表达关键安全动作。
- 密码显示、复制和删除图标必须有 Tooltip。

## 7. Rust 核心

建议依赖方向：

```text
commands → application → domain
                    ├─ security ports
                    ├─ repository ports
                    └─ platform ports

infrastructure implements ports
```

候选依赖：

- `tauri`
- `serde`
- `thiserror`
- `tracing`
- `uuid`
- `argon2`
- `aes-gcm` 或最终选定 AEAD
- `secrecy`
- `zeroize`
- `rusqlite`
- 操作系统安全随机接口的成熟封装

每个关键依赖在安装前检查：

- 维护状态。
- 安全公告。
- 许可证。
- Windows 支持。
- 是否启用不必要默认特性。

## 8. SQLCipher

选择条件：

- 可以通过 Rust 绑定使用原始 256 位 DEK。
- Windows x64 构建稳定。
- 安装包包含所需本地库，或静态链接。
- 不要求用户单独安装数据库组件。
- 备份 API、完整性检查和迁移可用。
- 许可证与项目许可证兼容。

必须先制作技术原型，不能直接开始完整业务开发。

## 9. Windows 安装器

选择 Tauri NSIS，生成单一：

```text
WebPasswordManager-Setup-x.y.z.exe
```

WebView2 策略：

- 为满足“一个文件、可以离线安装”，公开离线包优先使用 Tauri 的 `offlineInstaller` 模式。
- 代价是安装包会显著增大。
- 开发版可以依赖系统已有 WebView2。
- 不能使用 `skip` 后让应用在缺少 WebView2 时无说明失败。

安装原则：

- 当前用户安装。
- 不安装服务和驱动。
- 不默认开机启动。
- 卸载默认保留保险库。
- 安装器和主程序正式发布时签名。

## 10. 网络与 WebView 安全

- 生产应用不加载远程页面。
- 不允许远程脚本。
- 设置严格 CSP。
- 用户内容只按文本渲染。
- 禁止 Tauri Shell 万能执行能力。
- 文件系统权限只开放应用数据目录和用户明确选择的备份文件。
- 网站通过系统默认浏览器打开，不在应用 WebView 中浏览。

## 11. 测试

### 11.1 Rust

- 领域规则：普通单元测试。
- 仓储：临时 SQLCipher 数据库集成测试。
- 密码学：官方向量、篡改和生命周期测试。
- 平台服务：接口替身和少量 Windows 集成测试。

### 11.2 前端

- Vitest 测试模块状态、表单和安全反馈。
- Testing Library 测试键盘、焦点和可访问名称。
- TypeScript 类型检查作为独立 CI 步骤；Vite 本身只转译 TypeScript。

### 11.3 端到端

- Windows 上运行真实 Tauri 构建。
- 创建、重启、解锁、保存、搜索、复制和锁定。
- 不依赖浏览器模拟来证明数据库和密钥安全。

## 12. 开发工具

- Node.js 当前 LTS。
- npm 和 `package-lock.json`。
- Rust stable 和 `Cargo.lock`。
- ESLint。
- Prettier。
- `rustfmt`。
- Clippy。
- GitHub Actions 或等价 CI，正式发布流程后续确定。

## 13. 明确不使用

- Next.js。
- 服务端 Node.js。
- Docker 运行桌面应用。
- 外部数据库服务器。
- 云端密钥服务。
- localStorage 保存敏感信息。
- Electron 与 Tauri 双实现。
- 动态加载未知插件。
- 远程 CDN。

## 14. 原型验证门槛

在业务开发前建立最小技术原型，必须证明：

- [ ] Tauri 应用可在目标 Windows 设备启动。
- [ ] React 界面可调用受限 Rust 命令。
- [ ] SQLCipher 可创建、关闭和重新打开数据库。
- [ ] Rust 生成 DEK 并以原始密钥打开 SQLCipher。
- [ ] 错误密钥和密文篡改失败。
- [ ] NSIS 可以生成一个离线 `Setup.exe`。
- [ ] 安装后无需单独安装数据库运行时。
- [ ] 程序和保险库存放位置分离。
- [x] 应用退出时 Rust 关闭数据库；文件对异常时拒绝创建、覆盖或写入。

任一关键项失败时先调整技术栈，不继续堆叠业务代码。

## 15. 版本策略

- 初始化时使用当前稳定版，不使用 beta 或 nightly。
- 直接依赖固定补丁版本或使用严格锁文件。
- Rust 使用稳定工具链，不依赖 nightly 特性。
- 每次升级关键依赖单独提交并运行安全测试。
- Tauri、WebView2、SQLCipher、Argon2 和 AEAD 库升级需要安全评审。

## 16. 待决策事项

- [ ] 原型后确定 SQLCipher Rust 绑定与编译方式。
- [ ] 确定最终 AEAD 库。
- [ ] 确定最低 Windows 和 WebView2 版本。
- [ ] 确定前端路由库。
- [ ] 确定正式代码签名服务。
- [ ] 原型测量离线安装包体积。

## 17. 参考资料

- [Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/)
- [React Versions](https://react.dev/versions)
- [Vite Getting Started](https://vite.dev/guide/)
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4)
- [shadcn/ui for Vite](https://ui.shadcn.com/docs/installation/vite)
- [Vitest Guide](https://vitest.dev/guide/)

## 18. 相关文档

- [系统架构](SYSTEM_ARCHITECTURE.md)
- [模块架构](MODULE_ARCHITECTURE.md)
- [数据库设计](../03-storage/DATABASE_DESIGN.md)
- [加密设计](../04-security/ENCRYPTION_DESIGN.md)
- [界面架构](../07-ui-ux/UI_ARCHITECTURE.md)
- [开发环境](../08-development/DEVELOPMENT_SETUP.md)
