# M3 公开测试版准备交接

> 最后更新日期：2026-08-02
>
> 状态：`0.2.0-beta.1` 候选收口中；进度以 [M3 执行计划](09-PHASE_3_EXECUTION_PLAN.md) 为准

## 1. 当前基线

- 仓库：`AnkoFan/web-password-manager`；默认分支 `main`。
- M2.6 不可移动基线：`b594757953f56b5022f39ceb5a61403c540f70c3` / `m2.6-internal`。
- M3 工作分支：`agent/m3-execution-plan`。
- 当前产品决策：随机 256 位 SQLCipher 数据库密钥由当前 Windows 用户 DPAPI 自动保护，启动时自动打开。
- 不提供主密码、锁定、解锁、自动锁定、生物识别或 Windows 生命周期锁定。
- 当前工作分支已经实现分类、网站、多账号行内编辑、搜索、敏感字段操作、网址打开、批量网站软删除、回收站恢复、加密备份恢复和安装升级保护。

## 2. 不可放宽的边界

- M3 发布门禁全部通过前只使用虚构测试数据。
- 不读取、迁移、覆盖或删除旧明文及旧主密码测试保险库。
- 数据库不得以普通 SQLite 文件头落盘，DPAPI 文件、日志和测试证据不得包含数据库明文密钥。
- 前端只通过类型化 Tauri 命令访问业务和敏感能力。
- 不重新加入任何锁定或解锁设计。

## 3. 当前剩余工作

1. 将前端、Rust 与 Tauri 版本统一冻结为 `0.2.0-beta.1`。
2. 清理当前有效文档中已废止的主密码、KDF 和锁定验收要求；历史阶段记录保留。
3. 在候选版本上运行前端、Rust、npm audit、RustSec、生产构建和敏感面门禁。
4. 生成最终 Windows NSIS 安装包，记录文件大小和 SHA-256。
5. 一次性提交并推送候选；只短时查询 CI，避免免费 GitHub Actions 额度被持续监视或重复推送消耗。
6. CI 通过后合入 `main`；是否创建公开 GitHub Release 和标签由项目所有者最终确认。

## 4. 发布边界

- 当前安装包尚无正式代码签名，发布说明必须明确披露 Windows 可能显示“未知发布者”。
- DPAPI 备份通常不能跨 Windows 用户或设备恢复。
- 应用启动后数据自动可见；当前用户上下文恶意程序、管理员、运行期内存读取、屏幕和剪贴板历史不由静态加密解决。
- 云同步、团队共享、浏览器扩展、移动端和真实凭据迁移不进入当前 M3。

## 5. 必读文档

- [开发路线图](05-ROADMAP.md)
- [M3 执行计划](09-PHASE_3_EXECUTION_PLAN.md)
- [ADR-014：DPAPI + SQLCipher 自动打开](12-ADR_DPAPI_SQLCIPHER_AUTO_OPEN.md)
- [安全测试计划](../04-security/SECURITY_TEST_PLAN.md)
- [安全测试用例](../09-testing/SECURITY_TEST_CASES.md)
- [质量检查清单](../09-testing/QUALITY_CHECKLIST.md)
- [发布检查清单](../09-testing/RELEASE_CHECKLIST.md)
- [发布说明草案](../10-release-and-operations/RELEASE_NOTES_0.2.0-beta.1_DRAFT.md)
