# 安全测试用例

> 状态：M2.6 基线完成
>
> 最后更新日期：2026-07-30

## 密码学与存储

| 用例 | 预期 |
| --- | --- |
| RFC 9106 Argon2id 已知答案 | 输出完全匹配 |
| IETF XChaCha20-Poly1305 草案已知答案 | 密文与标签完全匹配 |
| 错误主密码 | 解包失败，不返回内部错误 |
| 盐、nonce、AEAD 标签或 AAD 被修改 | 安全拒绝 |
| SQLCipher 页面单字节被修改 | 完整性检查拒绝 |
| 数据库被截断 | 解锁拒绝 |
| 安全头与数据库来自不同保险库 | 解锁拒绝 |
| KDF 参数超出支持值 | 派生前拒绝 |
| 备份摘要或密文损坏 | 不覆盖当前保险库 |

## 会话与前端

| 用例 | 预期 |
| --- | --- |
| 锁定后调用业务命令 | 统一拒绝 |
| 空闲超时或窗口失焦 | Rust 连接关闭并通知前端 |
| 列表与搜索 | 不返回秘密字段值 |
| 生产源码使用 Web Storage、直接剪贴板或控制台日志 | 静态门禁失败 |
| CSP 允许不安全脚本或非 IPC 连接 | 静态门禁失败 |
| Tauri 增加剪贴板、Shell、进程或网络权限 | 静态门禁失败 |
| 生产包包含 Web Storage、开发原型或测试秘密 | 构建门禁失败 |

## 运行命令

```powershell
npm.cmd run check:frontend
npm.cmd audit --audit-level=moderate
scripts\cargo-test.cmd
```

GitHub Actions 已运行并通过 RustSec `audit-check`；M3 的每个 Pull Request 继续执行本文件列出的自动化门禁。
