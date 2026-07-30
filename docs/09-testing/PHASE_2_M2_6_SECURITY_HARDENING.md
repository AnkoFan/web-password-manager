# M2.6 安全加固记录

> 日期：2026-07-30
>
> 状态：开发完成 / 内部验收通过

## 范围

- 建立可追溯、可回退的 M2.5 Git 基线。
- 处理 Windows 下 SQLCipher 增强内存安全导致的栈溢出。
- 扩充密文、密钥包装和 KDF 参数负向测试。
- 增加密码学已知答案、生产包敏感面扫描和 CI 质量门禁。

## 实现

- 基线提交：`958a40e`。
- 基线标签：`m2.5-internal`。
- `.gitignore` 排除保险库数据库、安全头、备份、密钥、环境配置、日志和构建产物。
- 构建定义 `LIBSQLITE3_FLAGS=-DOMIT_MEMLOCK`，关闭 SQLCipher 的 OS 页锁定调用。
- 每个加密连接启用 `PRAGMA cipher_memory_security = ON`，随后读回状态；状态不是 `1` 时安全失败。
- 前端门禁扫描 Web Storage、直接剪贴板、运行时日志、CSP、Tauri 权限和生产构建包。
- GitHub Actions 配置前端检查、npm audit、Windows Rust/SQLCipher 测试和 RustSec。

SQLCipher 增强内存安全会覆盖 SQLite/SQLCipher 的全部分配器内存。当前 Windows 构建不调用 `VirtualLock`，因此验收结论仅包含增强内存擦除，不包含防换出保证。

## 自动化证据

| 检查 | 结果 |
| --- | --- |
| Rust 完整测试 | 44/44 通过 |
| RFC 9106 Argon2id 已知答案 | 通过 |
| IETF XChaCha20-Poly1305 草案已知答案 | 通过 |
| SQLCipher 内存擦除状态 | 通过 |
| 数据库单字节篡改 | 安全拒绝 |
| 数据库截断 | 安全拒绝 |
| 盐、nonce、AEAD 标签和 AAD 篡改 | 安全拒绝 |
| 安全头与数据库错配 | 安全拒绝 |
| 非法 KDF 参数 | 派生前安全拒绝 |
| 备份损坏且不覆盖当前保险库 | 通过 |
| 前端架构、Vitest、TypeScript 和 Vite | 通过 |
| 生产包敏感面扫描 | 通过 |
| npm audit | 0 个漏洞 |
| Windows 原生构建 | 通过，22,926,336 字节 |

## 开发结束后的发布门禁

- 连接 GitHub 后首次运行并通过全部 Actions，尤其是 RustSec。
- 使用虚构数据人工验证 Windows 锁屏、休眠、切换用户和异常退出。
- 检查真实 WebView2 缓存目录与崩溃转储。
- 完成安装包签名、许可证选择和独立安全评审。
- Windows OS 页锁定或等价防换出策略作为长期加固项，不阻断内部 M2.6 完成。
