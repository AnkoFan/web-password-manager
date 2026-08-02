# 安全测试计划

> 状态：M3 `0.2.0-beta.1` 候选有效
>
> 最后更新日期：2026-08-02

## 范围与目标

验证 Windows 桌面端在“SQLCipher 数据库 + 当前用户 DPAPI 保护随机数据库密钥 + 启动自动打开”的产品决策下，不把数据库或密钥以明文写入磁盘，并在文件损坏、文件对不完整、备份损坏和安装升级失败时停止覆盖。全程只使用明确标记的虚构测试数据。

## 测试层级

1. Rust 自动化：DPAPI 往返和篡改拒绝、SQLCipher 文件头、仓储约束、备份验证、失败回滚与命令边界。
2. 前端自动化：类型、架构、发布配置、交互回归、生产构建和敏感面扫描。
3. 依赖审计：`npm audit --audit-level=moderate` 与 RustSec；Windows 不可达的传递依赖提示必须记录目标依赖图证据。
4. Windows 人工验收：首次启动、重启、备份恢复、损坏拒绝、覆盖安装、卸载数据语义、键盘和可访问性。
5. 发布产物：固定候选提交、版本、安装包 SHA-256 和未签名披露。

## 约束与风险

- DPAPI 通常绑定当前 Windows 用户配置文件，不保证跨用户或跨设备恢复。
- 应用没有主密码、锁定或解锁功能，启动后数据自动可见。
- 当前用户上下文恶意程序、管理员权限、运行期内存读取、屏幕捕获和剪贴板历史不由静态加密解决。
- 旧明文和旧主密码测试保险库不迁移、不读取、不覆盖、不删除。
- 未正式签名的安装包只能依靠独立渠道公布的 SHA-256 检查完整性，不能证明发布者身份。

## 验收标准

- `scripts\cargo-test.cmd` 全部通过，且数据库文件头不是 `SQLite format 3`。
- DPAPI 密钥文件不含数据库明文密钥；篡改或用户上下文不匹配时拒绝写入。
- 数据库和密钥文件只有一个存在、数据库损坏或 schema 不兼容时保持原文件不变。
- 加密备份在替换前验证两个文件、清单、摘要、DPAPI、SQLCipher 和 schema；失败恢复回滚原组合。
- `npm.cmd run check:frontend`、npm audit、RustSec 和 Windows 生产构建通过。
- 当前 UI 和命令契约不包含主密码、锁定、解锁、自动锁定或生命周期锁定入口。
- 候选安装包版本和三个项目清单一致，SHA-256 写入发布检查清单。

## 相关记录

- [ADR-014：DPAPI + SQLCipher 自动打开](../00-foundation/12-ADR_DPAPI_SQLCIPHER_AUTO_OPEN.md)
- [M3 执行计划](../00-foundation/09-PHASE_3_EXECUTION_PLAN.md)
- [安全测试用例](../09-testing/SECURITY_TEST_CASES.md)
- [发布检查清单](../09-testing/RELEASE_CHECKLIST.md)
- [发布说明草案](../10-release-and-operations/RELEASE_NOTES_0.2.0-beta.1_DRAFT.md)
