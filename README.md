# WebPasswordManager

> 完全本地、开源、模块化的账号信息管理工具。
>
> 当前开发阶段：M3 范围调整中；仅允许使用虚构测试数据。

## 重要安全提示

自 2026-08-01 起，项目按产品决定取消整个锁定/解锁设计，包括主密码、自动锁定、Windows 锁屏联动、KDF、密钥包装和 SQLCipher。Windows 桌面端现在把数据写入普通 SQLite 文件 `password-manager.db`，本机备份同样不加密。

任何能读取当前 Windows 用户应用数据目录的人或程序，都可以直接读取数据库和备份。本版本不是安全密码保险库，不得保存真实密码、Token、恢复码或其他真实秘密。

旧的 `vault.db` 与 `vault.header.json` 测试文件不会迁移、不会自动打开，也不会被新实现覆盖。

## 已实现功能

- 分类、网站、多账号、基础字段和自定义字段的新增与编辑。
- 搜索非敏感索引，敏感字段默认遮挡并按需显示或复制。
- 级联软删除、回收站和按删除批次恢复。
- 网址校验与默认浏览器打开。
- 剪贴板条件定时清理。
- 普通 SQLite 本地备份、SHA-256 完整性验证和恢复。
- React/Tauri 类型化命令边界、CSP、最小权限、自动化测试和 Windows 安装程序。

## 开发命令

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run check
scripts\tauri-build.cmd
```

Windows 桌面构建需要 Rust stable 和 Visual Studio 2022 C++ Build Tools；不再需要 SQLCipher/OpenSSL 的 Perl 构建依赖。

## 数据与权限边界

- 不使用账号注册、云同步、遥测或远程脚本。
- React 前端不使用 Web Storage 保存业务数据；桌面数据由 Rust 访问 SQLite。
- 列表与搜索响应不包含敏感字段值，字段值按操作读取。
- 浏览器开发原型只驻留内存，刷新后重置。
- 数据库和备份是明文 SQLite，不提供静态保密性。
- 所有开发、自动化、截图、安装和恢复测试只使用明确标记的虚构数据。

## 目录

- `src/`：React 界面、功能模块和 Tauri 调用适配层。
- `src-tauri/`：Rust 桌面壳、SQLite 仓储、命令和安装包配置。
- `docs/`：产品、架构、安全、数据、开发和测试文档。

## 开源许可

本项目采用 [MIT License](LICENSE)。
