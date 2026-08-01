# WebPasswordManager

> 完全本地、开源、模块化的账号与敏感信息管理工具。
>
> 当前版本：`0.1.0` / 第二阶段 M2.1–M2.6 内部验收完成
>
> 最后更新日期：2026-07-30

## 当前状态

当前版本已经完成第二阶段 M2.1–M2.6 的内部账号管理与安全加固闭环：

1. 创建、锁定和解锁本地 SQLCipher 保险库。
2. 创建和编辑分类、网站、多账号、基础字段与自定义字段。
3. 搜索非敏感内容、按需显示或复制敏感字段、校验并打开网址。
4. 级联软删除与按删除批次恢复。
5. 自动锁定、条件清理剪贴板、本机加密备份与验证恢复。
6. SQLCipher 增强内存擦除、密码学已知向量、篡改矩阵、生产包敏感面扫描和 CI 门禁。

React 前端只通过类型化 Tauri 命令访问业务与敏感能力；列表和搜索响应不包含秘密值，敏感值按字段、按操作读取。浏览器开发模式继续使用仅驻留内存的等价原型，刷新后重置；Windows 桌面端使用真实 SQLCipher 仓储。

M2 已在私有 GitHub 仓库完成首次发布，前端、Windows Rust/SQLCipher、RustSec 和安全审计门禁全部通过。下一阶段是 M3 公开测试版准备，入口见 [M3 交接说明](docs/00-foundation/08-PHASE_3_HANDOFF.md)。

## 开发命令

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd test
npm.cmd run build
npm.cmd run check:sensitive
```

构建 Windows 桌面程序还需要 Rust stable、Visual Studio 2022 C++ Build Tools
和 Strawberry Perl：

```powershell
scripts\check-environment.cmd
scripts\cargo-test.cmd
scripts\tauri-build.cmd
```

首个安装包已生成于
`src-tauri/target/release/bundle/nsis/WebPasswordManager_0.1.0_x64-setup.exe`。

## 安全边界

- 不使用账号注册、云同步、遥测或远程脚本。
- 主密码不得写入日志或前端持久化存储。
- 密码与令牌默认遮挡；复制操作不在通知中显示实际内容。
- SQLCipher 业务仓储、自动锁定、剪贴板条件清理、备份恢复、密码学已知向量和生产包敏感面扫描已完成内部测试。
- 保险库格式尚未完成独立安全评审，安装包也未签名，因此当前版本仍只用于虚构测试数据。
- 仓库公开前不启用 GitHub Free 不支持的私有仓库分支保护；M3 期间继续使用功能分支和 Pull Request 工作流。

## 目录

- `src/`：React 界面、功能模块和 Tauri 调用适配层。
- `src-tauri/`：Rust 桌面壳、命令边界、权限和安装包配置。
- `docs/`：产品、架构、安全、数据、开发和测试文档。
- `docs/07-ui-ux/assets/primary-screen-concept.png`：第一阶段视觉基准。

## 开源许可

本项目采用 [MIT License](LICENSE)；选择记录与依赖归属后续工作见 `LICENSE_SELECTION.md`。
