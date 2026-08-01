# M3.5 Windows 安装、升级与卸载验收

> 日期：2026-07-31
>
> 状态：当前 Windows 隔离安装、原子失败、升级和显式清理已通过 / 正式 identifier 与迁移联动仍待验收

## 隔离原则

当前机器已经存在 `WebPasswordManager` 安装和应用数据。为避免覆盖既有 `vault.db`，本轮使用同一 NSIS 配置和代码路径、但使用以下专用测试身份：

- 产品名：`WebPasswordManager M3 Install Test`
- identifier：`io.github.webpasswordmanager.m3installtest`
- 基线版本：`0.1.0`
- 升级版本：`0.1.1`

基线源码严格来自不可移动标签 `m2.6-internal` 的 `b594757953f56b5022f39ceb5a61403c540f70c3`。升级版本来自当前 M3 工作树。测试版本不等同于公开 beta，也不改变生产清单版本。

## 产物

| 产物 | 字节 | SHA-256 | 签名 |
| --- | ---: | --- | --- |
| `WebPasswordManager M3 Install Test_0.1.0_x64-setup.exe` | 210,610,759 | `AF59F0F36040C6AB4CE0DD57F75D8371EE39A299560BE75109655BE170FFFBCC` | 未签名 |
| `WebPasswordManager M3 Install Test_0.1.1_x64-setup.exe` | 216,775,403 | `3F6178C6B12B6D420D77C1257BE44B9B291942B5BB6FBBB0200FB162CA77AECB` | 未签名 |

产物位于本机忽略的 `src-tauri/target/release/bundle/nsis/`，仅供技术验收，不得发布。

## 自动执行结果

| 测试 | 结果 |
| --- | --- |
| 当前用户静默全新安装 0.1.0 | 退出码 0；安装目录、卸载器和 HKCU 注册项存在 |
| 版本资源 | 可执行文件与注册表均为 0.1.0 |
| 同版本静默修复 | 退出码 0；虚构 sentinel 摘要不变 |
| 0.1.0 覆盖升级到 0.1.1 | 退出码 0；文件与注册表版本均更新为 0.1.1 |
| 升级数据保留 | 虚构 sentinel 存在且 SHA-256 不变 |
| 默认静默卸载 | 退出码 0；安装目录与卸载注册项删除 |
| 默认卸载数据保留 | 虚构 sentinel 仍存在 |
| 旧应用进程运行时可见升级 | 安装器提示关闭旧应用；确认后关闭当前用户的旧进程并继续覆盖，取消则不修改安装 |
| 非应用进程仍独占程序文件 | 安装器在复制失败时中止；不得把注册表版本误写为新版本，虚构 sentinel 保留 |
| 显式 `/DELETEAPPDATA` 卸载 | 退出码 0；仅隔离 identifier 的安装目录、卸载注册项、`%APPDATA%` 测试数据被删除 |
| MIT 许可证打包 | 生成的 NSIS `LICENSE` 宏指向随包复制的 `license_file`，可见安装流程包含许可证页 |
| 测试清理 | 焦点与纯键盘复测后再次执行 `/DELETEAPPDATA`；退出码 0，隔离安装目录、Local/Roaming 数据和卸载注册项均不存在；临时 Git worktree 已删除 |

测试只创建了 `M3-TEST-ONLY-INSTALL-SENTINEL.txt`，没有读取、复制或修改现有生产 identifier 的保险库文件。

## 卸载数据语义

Tauri NSIS 卸载确认页默认不删除应用数据，并提供显式“删除应用数据”选择。只有用户选择该项并继续卸载时，模板才删除当前 identifier 对应的 `%APPDATA%` 和 `%LOCALAPPDATA%` 目录；升级模式不会执行该删除。

`windows/nsis-hooks.nsh` 不再抢先以文件写测试中止安装，而是让 Tauri NSIS 内置 `CheckIfAppIsRunning` 处理旧进程。可见安装提示用户关闭当前用户的旧应用，确认后关闭并继续，取消或关闭失败则在覆盖前中止；静默覆盖会自动关闭同一当前用户的旧进程。卸载钩子另外接受显式 `/DELETEAPPDATA`，用于把与可见复选框相同的清理状态纳入可重复自动验收；普通静默卸载仍不清理数据。

普通静默卸载验证默认保留路径；显式 `/DELETEAPPDATA` 验证自动清理范围不越过专用 identifier。可见卸载确认页仍需人工检查文字、焦点、默认未选中状态和二次确认体验。

## 尚未关闭

- 正式产品 identifier 下使用真实 `0.1.0` 安装包到 beta 安装包的可见覆盖升级。
- 用虚构 v1 保险库在安装升级后触发 v2 迁移，并核对迁移快照和业务数据。
- 安装进程被强制中断和磁盘空间不足路径。
- 可见卸载页的文字、焦点和二次确认人工检查；清理状态与范围已通过显式参数验证。
- 正式代码签名、时间戳和发布产物哈希。

在这些步骤完成前，M3.5 和发布检查清单保持未完成。
