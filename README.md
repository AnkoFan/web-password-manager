# WebPasswordManager

WebPasswordManager 是一款完全本地运行的 Windows 账号信息管理工具，用于集中整理网站、账号、密码和自定义字段。项目不需要注册账号，不依赖云服务，也不收集遥测数据；所有保险库数据均保存在当前电脑中。

桌面端使用 SQLCipher 加密数据库，并通过 Windows DPAPI 保护数据库密钥，提供分类管理、快速搜索、敏感字段复制、回收站、本地备份恢复和系统托盘等功能。

> 当前版本为 `0.6.0-bate`。应用尚未经过正式安全审计，请只使用虚构测试数据，不要保存真实密码、Token、恢复码或其他重要凭据。

## 主要功能

- 按分类和网站管理多个账号。
- 保存用户名、密码、邮箱、备注和可排序的自定义字段。
- 搜索账号，遮挡、显示或复制敏感字段，并可直接打开网站。
- 输入网站网址后自动读取并填写网站名称，且不会覆盖手动输入。
- 级联软删除、回收站恢复和批次恢复。
- 按条件定时清理剪贴板内容。
- 创建、校验和恢复本地加密备份。
- 支持系统托盘、关闭行为设置和六种界面强调色。
- 完全离线运行，无账号注册、云同步、遥测或远程脚本。

## 系统要求

直接安装和使用需要：

- 仍在 Microsoft 支持期内并安装了安全更新的 Windows 11 x64。
- 至少 8 GiB 内存和 1 GiB 可用磁盘空间。
- WebView2 Runtime。安装程序内置离线 WebView2 安装器，系统缺少运行时时会自动安装。

当前不支持 Windows on ARM、32 位 Windows、macOS 或 Linux。

## 安装说明

### 使用安装程序

1. 打开项目的 [GitHub Releases](https://github.com/AnkoFan/web-password-manager/releases) 页面。
2. 下载最新版本的 `WebPasswordManager_*_x64-setup.exe`。
3. 双击安装程序，根据提示完成当前用户安装。安装过程不需要管理员权限。
4. 从开始菜单或桌面快捷方式启动 **WebPasswordManager**。

如 Windows SmartScreen 提示未知发布者，请先确认安装包来自本项目的 GitHub Releases。当前安装包尚未提供 Windows 代码签名。

### 从源码运行

构建环境需要：

- Node.js 22 或更高版本。
- npm 10 或更高版本。
- Rust stable MSVC 工具链。
- Visual Studio 2022 Build Tools，并安装“使用 C++ 的桌面开发”工作负载和 Windows SDK。
- Strawberry Perl 5.42，用于构建 SQLCipher/OpenSSL。

在 PowerShell 中执行：

```powershell
git clone https://github.com/AnkoFan/web-password-manager.git
cd web-password-manager
npm.cmd install
scripts\check-environment.cmd
npm.cmd run tauri dev
```

`npm.cmd run tauri dev` 会同时启动前端开发服务器和 Tauri 桌面应用。

如果只需要查看浏览器界面原型，可以执行：

```powershell
npm.cmd run dev
```

然后访问 `http://127.0.0.1:1420/`。浏览器原型只在内存中保存数据，刷新页面后会重置，也不会模拟 Windows DPAPI。

### 测试和构建安装包

运行全部前端、Rust、架构和敏感数据检查：

```powershell
npm.cmd run check
```

构建 Windows NSIS 安装程序：

```powershell
scripts\tauri-build.cmd
```

构建完成后，安装程序位于：

```text
src-tauri\target\release\bundle\nsis\
```

## 使用说明

1. 首次启动应用，保险库会在当前 Windows 用户的应用数据目录中自动创建并打开。
2. 新建分类和网站，然后为网站添加一个或多个账号。
3. 在账号中填写用户名、密码、邮箱、备注或自定义字段。敏感字段默认遮挡，可按需显示或复制。
4. 使用顶部搜索框查找账号；删除的内容会进入回收站，可在回收站中恢复。
5. 在设置中调整界面颜色、剪贴板清理和关闭窗口行为。
6. 定期在设置中创建本地备份，并在需要时先校验再恢复备份。

应用使用当前 Windows 用户的 DPAPI 自动保护密钥，因此没有主密码、手动锁定、自动锁定或锁屏联动功能。它可以保护静态数据库文件，但不能防御当前用户上下文中的恶意程序、管理员权限程序、运行期内存读取、屏幕捕获或剪贴板历史。

## 开源许可证

本项目基于 [MIT License](LICENSE) 开源。你可以在许可证允许的范围内使用、复制、修改和分发本项目。

## 联系方式

如有问题、建议或安全相关反馈，请发送邮件至 [anko94319@gmail.com](mailto:anko94319@gmail.com)。
