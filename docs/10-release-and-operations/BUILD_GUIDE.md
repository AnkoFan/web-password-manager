# 构建指南

> 用途说明：定义和记录“构建指南”的目标、规则、设计与后续决策。
>
> 状态：第一阶段实施中
>
> 最后更新日期：2026-07-30

## 第一阶段 Windows 构建

本项目第一阶段只发布 Windows 64 位桌面版，并以单个 NSIS `Setup.exe`
作为用户入口。应用运行时完全本地，不依赖 Docker、云服务或后台服务器。

```powershell
npm.cmd install
npm.cmd test
scripts\cargo-test.cmd
scripts\tauri-build.cmd
```

预期输出目录：

```text
src-tauri/target/release/bundle/nsis/
```

安装包内嵌 WebView2 离线安装程序，以便在缺少运行环境的 Windows 设备上完成安装。

## 发布前验收

- [x] 前端单元测试通过
- [x] Rust 单元测试与 SQLCipher 文件头测试通过
- [ ] 新建、解锁、锁定、重新启动后解锁流程通过
- [ ] 安装、卸载及当前用户权限安装通过（安装与启动已通过，卸载待验证）
- [x] 安装包哈希值已记录
- [ ] 未签名安装包明确标注 Windows 可能显示信誉提醒

## 待完善章节

- [ ] Windows 代码签名
- [ ] 可复现构建与依赖锁定
- [ ] macOS、Linux 构建方式（第二阶段以后）

## 0.1.0 构建记录

- 产物：`WebPasswordManager_0.1.0_x64-setup.exe`
- 大小：210,419,213 字节
- SHA-256：`B5CDFCACDDCD01798D4B1F01F8271E83189E36060041EB0A417AE4023FC10E14`
- 安装方式：当前用户
- 实际安装位置：`%LOCALAPPDATA%\WebPasswordManager`
- 安装与启动：通过
- 代码签名：未签名，仅供技术原型测试
