# M2.6 安全加固记录

> 日期：2026-07-30
>
> 状态：首批加固通过

## 范围

- 建立可追溯、可回退的 M2.5 Git 基线。
- 处理 Windows 下 SQLCipher 增强内存安全导致的栈溢出。
- 扩充密文、密钥包装和 KDF 参数负向测试。

## 实现

- 基线提交：`958a40e`。
- 基线标签：`m2.5-internal`。
- `.gitignore` 排除保险库数据库、安全头、备份、密钥、环境配置、日志和构建产物。
- 构建定义 `LIBSQLITE3_FLAGS=-DOMIT_MEMLOCK`，关闭 SQLCipher 的 OS 页锁定调用。
- 每个加密连接启用 `PRAGMA cipher_memory_security = ON`，随后读回状态；状态不是 `1` 时安全失败。

SQLCipher 增强内存安全会覆盖 SQLite/SQLCipher 的全部分配器内存。当前 Windows 构建不调用 `VirtualLock`，因此验收结论仅包含增强内存擦除，不包含防换出保证。

## 自动化证据

| 检查 | 结果 |
| --- | --- |
| Rust 完整测试 | 40/40 通过 |
| SQLCipher 内存擦除状态 | 通过 |
| 数据库单字节篡改 | 安全拒绝 |
| 数据库截断 | 安全拒绝 |
| 包装 DEK 篡改 | 安全拒绝 |
| 非法 KDF 参数 | 派生前安全拒绝 |
| 备份损坏且不覆盖当前保险库 | 通过 |

## 未关闭

- Argon2id 与 XChaCha20-Poly1305 标准已知向量。
- 盐、nonce、AEAD 标签和安全头/数据库错配完整矩阵。
- WebView2 缓存、崩溃数据和 IPC 扫描。
- RustSec 与完整质量门禁 CI。
- Windows OS 页锁定或等价防换出策略。
