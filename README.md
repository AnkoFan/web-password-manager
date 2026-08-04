# WebPasswordManager

> 完全本地、开源、模块化的 Windows 账号信息管理工具。
>
> 当前开发阶段：M6 已完成；`0.5.0-beta.1` 候选收口；仅使用虚构测试数据。

## 当前存储方式

Windows 桌面端使用 SQLCipher 加密本地数据库，并用当前 Windows 用户的 DPAPI 自动保护随机 256 位数据库密钥。应用启动时自动打开数据库：没有主密码，也没有锁定、解锁、自动锁定或锁屏联动功能。

活动文件为 `password-manager.dpapi.db` 与 `password-manager.dpapi-key`。旧明文测试库 `password-manager.db`、旧 `vault.db` 和安全头不会迁移、读取、覆盖或删除。

该设计保护静态数据库文件，但不防御当前用户上下文恶意程序、管理员、运行期内存读取、屏幕捕获或剪贴板历史。当前版本仍不得保存真实密码、Token 或恢复码。

## 已实现功能

- 分类、网站、多账号、基础字段和自定义字段。
- 搜索、敏感字段遮挡/显示/复制和网址打开。
- 账号详情、可选主邮箱、非敏感多行备注和可排序自定义字段。
- 级联软删除、回收站和批次恢复。
- 剪贴板条件定时清理。
- 首次关闭行为选择、系统托盘驻留与设置切换。
- 三栏保险库工作区、统一详情分区和六种可选界面强调色。
- DPAPI 自动保护的 SQLCipher 数据库与加密备份恢复。
- React/Tauri 类型化命令边界、CSP、最小权限、自动化测试和 Windows 安装程序。

## 开发命令

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run check
scripts\tauri-build.cmd
```

Windows 桌面构建需要 Rust stable、Visual Studio 2022 C++ Build Tools 和 Strawberry Perl（用于 SQLCipher/OpenSSL）。浏览器开发原型只驻留内存，刷新后重置，不模拟 Windows DPAPI。

## 数据规则

- 不使用账号注册、云同步、遥测或远程脚本。
- 列表与搜索响应不包含敏感字段值，字段值按操作读取。
- 所有开发、CI、截图、安装和恢复测试只使用明确标记的虚构数据。

## 开源许可

本项目采用 [MIT License](LICENSE)。
