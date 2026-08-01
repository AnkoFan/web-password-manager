# 数据库设计

> 状态：Windows DPAPI + SQLCipher 自动加密已实现
>
> 最后更新：2026-08-01

## 物理存储

- `password-manager.dpapi.db`：SQLCipher 加密 SQLite。
- `password-manager.dpapi-key`：当前 Windows 用户 DPAPI 保护的随机 256 位数据库密钥。
- `app-settings.json`：不含业务秘密的剪贴板设置。

密钥文件具有 `WPMDPK01` magic、显式长度和 64 KiB 上限。数据库密钥只在自动打开期间进入 Rust 零化缓冲区，传给 SQLCipher 后立即释放；DPAPI 返回的原生明文缓冲区在释放前以 volatile 写入清零。

## 创建与打开

1. 两个活动文件都不存在时生成随机数据库密钥。
2. 当前用户 DPAPI 保护密钥，写入独立暂存文件。
3. 用该密钥创建 SQLCipher 数据库、schema v2 和固定应用标记。
4. 验证密文/逻辑完整性后同步并提交两个文件。
5. 后续启动自动用 DPAPI 解密密钥并打开 SQLCipher。

两个文件只有一个存在时进入恢复错误；不把异常当作空库重新创建。

## 逻辑结构与验证

schema v2 包含 `metadata`、`vault_meta`、`categories`、`websites`、`accounts`、`account_fields` 与 `deletion_groups`。每次打开验证：

- SQLCipher `cipher_integrity_check` 无错误行；
- SQLite `integrity_check` 返回 `ok`；
- 应用标记、`user_version`、迁移版本与单一 `vault_meta` 有效；
- 外键和 SQLCipher 内存擦除已启用。

## 兼容边界

不迁移或读取 `password-manager.db` 明文测试库、旧 `vault.db` 或安全头。所有旧文件保持原样。
