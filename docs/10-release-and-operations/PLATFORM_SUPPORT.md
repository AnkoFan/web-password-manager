# 平台支持

> 状态：M3 Windows 范围已定义 / 最低硬件实机验收待完成
>
> 最后更新日期：2026-07-31

## 1. 支持范围

M3 只构建和测试 Windows x64 当前用户安装包，不支持 Windows on ARM、32 位 Windows、macOS 或 Linux。

公开 beta 只支持仍在 Microsoft 服务期内并已安装安全更新的 Windows 11 Home、Pro、Enterprise 或 Education 版本。项目不承诺支持已结束服务的 Windows 10 或 Windows 11 功能版本。

截至 2026-07-31：

- Windows 11 24H2 Home/Pro 仍在服务期内，但将于 2026-10-13 结束服务。
- Windows 11 25H2 Home/Pro 服务期到 2027-10-12，是 M3 推荐测试版本。
- Windows 11 26H1 仅面向 2026 年上市的部分新设备，不作为现有设备的最低要求。

发布时必须重新核对 Microsoft 生命周期；本文日期不能替代当前支持状态。

## 2. WebView2

- 使用系统 Evergreen WebView2 Runtime，安全修复由 Microsoft 更新机制提供。
- NSIS 包内嵌离线 WebView2 安装程序，缺少运行时时可离线安装。
- 不绑定固定 WebView2 Runtime 目录，避免项目自行承担浏览器内核补丁分发。
- 运行前提是 WebView2 已安装且仍受 Microsoft 支持；过旧或无法更新的运行时不在支持范围。

2026-07-31 参考环境检测到 WebView2 Runtime `150.0.4078.105`。这只是验收记录，不是最低版本承诺。

## 3. 最低硬件候选

用于完成 M3 KDF 门禁的最低目标设备定义为：

- x64 处理器，至少 4 个逻辑处理器；
- 8 GiB 物理内存；
- 至少 1 GiB 可用磁盘空间，另加保险库和备份容量；
- 支持当前服务中的 Windows 11 与 Evergreen WebView2。

正式最低配置仍需在真实或受控等价设备上完成 SQLCipher 打开、安装、覆盖升级和休眠/恢复验收。当前 16 GB / 16 逻辑处理器参考机器不能替代该证据。

## 4. 已知限制

- 当前只验证 MSVC x64 构建。
- SQLCipher 内存擦除已开启，但 Windows 构建不提供 OS 页锁定/防换出保证。
- 休眠文件、系统转储、剪贴板历史和第三方工具可能保留副本。
- 远程桌面、企业策略、受控文件夹访问和杀毒软件占用需要单独环境验证。

## 5. 验收

- [x] Windows x64、当前用户安装和 Evergreen WebView2 策略已定义。
- [x] 当前参考环境 Windows build 与 WebView2 版本已记录。
- [ ] 8 GiB / 4 逻辑处理器设备的 KDF、安装和生命周期验收通过。
- [ ] 发布当天重新确认 Windows 功能版本仍在服务期。
- [ ] 安装器在缺少 WebView2 的隔离环境完成离线安装。

## 6. 参考

- [Microsoft Windows 11 Home and Pro 生命周期](https://learn.microsoft.com/en-us/lifecycle/products/windows-11-home-and-pro)
- [Microsoft Windows 11 发布信息](https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information)
- [M3.3 KDF 基准](../09-testing/PHASE_3_M3_3_KDF_BENCHMARK.md)
