# 开发环境搭建

> 用途说明：记录本项目在 Windows 上的开发、测试和桌面构建环境。
>
> 状态：第一阶段已落地 / 桌面构建环境已安装
>
> 最后更新日期：2026-07-30

## 1. 基础环境

- Windows 10 或 Windows 11，64 位。
- Node.js 22 或更高版本。
- npm 10 或更高版本。
- Rust stable，MSVC 工具链。
- Visual Studio 2022 Build Tools，包含“使用 C++ 的桌面开发”工作负载。
- Strawberry Perl 5.42，用于从源码构建 SQLCipher 依赖的 OpenSSL。
- 系统 WebView2 Runtime；离线安装包会额外内嵌 WebView2 离线安装器。

## 2. 前端开发

PowerShell 执行策略可能阻止 `npm.ps1`，因此文档统一使用 `npm.cmd`：

```powershell
npm.cmd install
npm.cmd run dev
```

默认开发地址为 `http://127.0.0.1:1420/`。

## 3. 验证

```powershell
npm.cmd test
npm.cmd run build
```

测试数据必须是虚构值，不得使用真实密码、Token 或个人数据。

## 4. Tauri 桌面构建

本项目当前使用 Visual Studio Build Tools 2022（MSVC、Windows SDK）、
Rust stable MSVC 1.97 和 Strawberry Perl 5.42。项目脚本会自动加载工具链，
不依赖用户级 rustup 环境。

检查 Rust 核心、运行 Rust 测试和构建 NSIS 安装程序：

```powershell
scripts\check-environment.cmd
scripts\cargo-check.cmd
scripts\cargo-test.cmd
scripts\tauri-build.cmd
```

预期安装包位于：

```text
src-tauri/target/release/bundle/nsis/
```

## 5. 当前环境状态

2026-07-30 本机前端构建和测试通过。Visual Studio Build Tools 2022、独立
Rust stable MSVC 1.97 与 Strawberry Perl 5.42 已安装。SQLCipher 测试、
Release 构建、NSIS 安装包生成、当前用户安装和启动验证均已通过。

## 6. 待完善章节

- [x] 固定当前 Rust 与 MSVC 构建环境
- [x] 增加自动环境检查脚本
- [x] 完成首个 NSIS 离线安装包验证
- [ ] 记录 Windows 代码签名流程
