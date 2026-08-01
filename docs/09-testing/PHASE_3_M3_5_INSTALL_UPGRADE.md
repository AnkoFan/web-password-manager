# M3.5 Windows 安装、升级与卸载验收

> 日期：2026-07-31
>
> 状态：隔离安装机制已通过 / 正式 identifier 与交互式清理待人工验收

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
| `WebPasswordManager M3 Install Test_0.1.1_x64-setup.exe` | 210,638,013 | `22B44A84C00463EF4BC00E727A9E474CE475DF5EFB5C41A75A7182BB87CDEAF9` | 未签名 |

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
| 测试清理 | 隔离应用数据和临时 Git worktree 已删除 |

测试只创建了 `M3-TEST-ONLY-INSTALL-SENTINEL.txt`，没有读取、复制或修改现有生产 identifier 的保险库文件。

## 卸载数据语义

Tauri NSIS 卸载确认页默认不删除应用数据，并提供显式“删除应用数据”选择。只有用户选择该项并继续卸载时，模板才删除当前 identifier 对应的 `%APPDATA%` 和 `%LOCALAPPDATA%` 目录；升级模式不会执行该删除。

静默卸载没有选择清理数据，因此只验证默认保留路径。显式清理必须在隔离测试身份的可见卸载确认页由测试人员操作，确认删除范围不越过专用 identifier。

## 尚未关闭

- 正式产品 identifier 下使用真实 `0.1.0` 安装包到 beta 安装包的可见覆盖升级。
- 用虚构 v1 保险库在安装升级后触发 v2 迁移，并核对迁移快照和业务数据。
- 安装中断、磁盘空间不足和文件占用失败路径。
- 可见卸载页的保留/清理选择、二次确认与范围检查。
- 正式代码签名、时间戳和发布产物哈希。

在这些步骤完成前，M3.5 和发布检查清单保持未完成。
