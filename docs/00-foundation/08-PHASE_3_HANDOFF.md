# M3 公开测试版准备交接

> 交接日期：2026-07-30
>
> 状态：M2.1–M2.6 已完成 / M3 待启动

## 1. 起点

- 仓库：`AnkoFan/web-password-manager`，当前保持私有。
- 默认分支：`main`。
- M2.5 基线：`47a78f0` / `m2.5-internal`。
- M2.6 最终实现：`b594757` / `m2.6-internal`。
- 提交身份：`AnkoFan <168768984+AnkoFan@users.noreply.github.com>`。
- 首次远程 CI：前端、Windows Rust/SQLCipher、RustSec 与 Security audit 全部通过。
- 自动化基线：44 个 Rust 测试、4 个前端测试、生产构建、敏感面扫描和 npm audit 均通过。

M2 的开发与内部验收已经关闭。M3 不是继续补 M2 功能，而是把内部版本推进到可公开测试的质量、安全和治理门槛。

## 2. 不可放宽的边界

- M3 发布门禁全部通过前，只使用虚构测试数据。
- 不引入云同步、遥测、远程脚本、浏览器扩展、团队共享或动态插件。
- 主密码、DEK、密码、Token 和恢复码不得进入日志、Web Storage、崩溃转储或测试夹具。
- 前端继续只通过类型化 Tauri 命令访问业务和敏感能力。
- 不因赶版本移除篡改检查、锁定边界、敏感面扫描或最小权限配置。

## 3. M3 必做范围

1. 冻结 M3 版本号、退出条件和公开测试边界。
2. 更新威胁模型，覆盖公开分发、安装包替换、崩溃文件、升级与迁移。
3. 设计并实现安全头格式 v2、KDF 参数升级及迁移前备份/失败恢复。
4. 完成 Windows 锁屏、休眠、切换用户、异常退出、剪贴板历史、WebView2 缓存和崩溃转储人工验收。
5. 完成安装、覆盖升级、卸载和数据保留/清理测试。
6. 完善无障碍、键盘操作、错误状态与发布说明。
7. 选择开源许可证，记录发布产物 SHA-256，并评估代码签名。
8. 仓库公开后启用 `main` 分支保护，要求现有 CI 检查全部通过。
9. 在允许保存真实秘密或公开推荐前完成第三方或独立安全评审。

## 4. 建议首个增量

先创建 M3 执行计划，不直接修改保险库格式：

1. 明确版本号和退出条件。
2. 对安全头 v1、schema v2、备份恢复与 KDF 常量建立兼容矩阵。
3. 为格式 v2 编写设计决策记录、迁移失败场景和测试清单。
4. 评审通过后再实现最小迁移增量。

开发继续使用 `agent/<description>` 功能分支和 Pull Request。仓库仍为 GitHub Free 私有仓库时，分支保护依靠流程约束；公开后改为平台强制规则。

## 5. 新对话启动指令

在新对话中可以直接使用：

> 开始 M3。先读取 `docs/00-foundation/08-PHASE_3_HANDOFF.md`、路线图、安全回归和发布检查清单，核对 GitHub `main` 与 `m2.6-internal`，然后制定并执行 M3 首个增量。继续只使用虚构测试数据。

## 6. 必读文档

- [开发路线图](05-ROADMAP.md)
- [第二阶段执行计划](07-PHASE_2_EXECUTION_PLAN.md)
- [第二阶段安全回归](../04-security/PHASE_2_SECURITY_REVIEW.md)
- [M2.6 安全加固记录](../09-testing/PHASE_2_M2_6_SECURITY_HARDENING.md)
- [发布检查清单](../09-testing/RELEASE_CHECKLIST.md)
- [安全测试用例](../09-testing/SECURITY_TEST_CASES.md)
- [安全模型](../04-security/SECURITY_MODEL.md)
- [威胁模型](../04-security/THREAT_MODEL.md)
