# M3 独立安全评审包

> 准备日期：2026-07-31
>
> 状态：可供评审 / 独立评审者与候选提交待确定

## 1. 评审目标

确认 M3 是否能够进入只使用虚构测试数据的公开 beta 候选。评审完成本身不自动授权保存真实秘密；只有全部发布门禁关闭并由发布批准者明确批准后，才能重新评估该限制。

## 2. 固定基线

- M2.6 标签：`m2.6-internal`
- M2.6 提交：`b594757953f56b5022f39ceb5a61403c540f70c3`
- M3 候选提交：待代码冻结后填写
- 应用候选版本：`0.2.0-beta.1`
- 安全头：v2
- 数据库 schema：v2
- 备份清单：v1

## 3. 重点材料

- [M3 执行计划](../00-foundation/09-PHASE_3_EXECUTION_PLAN.md)
- [ADR-012：安全头 v2](../00-foundation/10-ADR_VAULT_HEADER_V2.md)
- [加密设计](ENCRYPTION_DESIGN.md)
- [威胁模型](THREAT_MODEL.md)
- [敏感数据处理](SENSITIVE_DATA_HANDLING.md)
- [安全测试用例](../09-testing/SECURITY_TEST_CASES.md)
- [M3.2 迁移验收](../09-testing/PHASE_3_M3_2_VAULT_MIGRATION.md)
- [M3.3 KDF 基准](../09-testing/PHASE_3_M3_3_KDF_BENCHMARK.md)
- [M3.4 Windows 生命周期验收](../09-testing/PHASE_3_M3_4_WINDOWS_LIFECYCLE.md)
- [M3.5 安装升级验收](../09-testing/PHASE_3_M3_5_INSTALL_UPGRADE.md)

## 4. 必审代码

- `src-tauri/src/security.rs`：v1/v2 解析、KDF 注册表、规范 AAD、DEK 包装。
- `src-tauri/src/storage.rs`：SQLCipher 打开、ID 绑定、迁移快照、提交与恢复。
- `src-tauri/src/windows_lifecycle.rs`：WTS 与电源消息边界。
- `src-tauri/src/commands.rs`：IPC 错误映射和会话门控。
- `src/services/desktop-vault-client.ts`：前端可调用命令集合。
- `src-tauri/capabilities/default.json` 与 `tauri.conf.json`：权限、CSP 和分发配置。
- `.github/workflows/ci.yml`：自动门禁。

## 5. 建议攻击问题

1. v2 JSON 的重复键、未知字段、非规范 hex、数值边界和未来版本能否绕过派生前拒绝？
2. AAD 是否绑定全部安全关键元数据，编码是否存在歧义或跨实现差异？
3. 任一迁移故障点是否可能产生“新头 + 旧库”且没有可验证回滚副本？
4. 头/库/备份跨保险库拼接能否绕过 vault ID 与 SQLCipher 验证？
5. KDF 参数是否会导致资源耗尽、整数溢出或静默降级？
6. WTS、电源、失焦和空闲锁定之间是否存在未锁定窗口或自动恢复连接？
7. WebView2、剪贴板、日志、临时文件、备份和转储是否泄露虚构 canary？
8. 覆盖升级、卸载清理和安装包替换是否可能删除或替换错误目录？

## 6. 已知未关闭项

- 最低 8 GiB / 4 逻辑处理器设备的 KDF 与并发证据。
- 真实锁屏、睡眠、用户切换、剪贴板历史、缓存和转储人工证据。
- 正式 identifier 的覆盖升级与交互式清理。
- 开源许可证选择与正文。
- 正式代码签名证书、时间戳和验证记录。
- GitHub 公开化、分支保护和连接器可见性。

## 7. 评审输出要求

- 评审者身份/组织、日期、候选完整 SHA 和评审范围。
- 每个发现的严重度、可复现步骤、影响、建议和处置状态。
- 明确列出未测试内容与依赖的人工假设。
- 阻断项关闭后由评审者复测，不以维护者自述替代。
- 最终结论只能是通过、带条件通过或未通过，不得省略剩余风险。
