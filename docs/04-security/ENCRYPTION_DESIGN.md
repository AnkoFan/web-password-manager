# 当前加密设计

> 状态：ADR-014 DPAPI + SQLCipher

## 密钥层次

1. Windows CSPRNG 生成随机 256 位数据库密钥。
2. SQLCipher 使用该密钥加密数据库页面并提供页面完整性。
3. Windows `CryptProtectData` 以当前用户范围保护数据库密钥，启用 `CRYPTPROTECT_UI_FORBIDDEN` 并使用应用固定可选熵。
4. 应用启动时用 `CryptUnprotectData` 自动恢复密钥，无用户密码流程。

DPAPI 数据文件不包含明文密钥。Rust 复制 DPAPI 输出后清零 Windows 原生缓冲区，密钥及其十六进制 SQLCipher PRAGMA 字符串由 `Zeroizing` 清理。SQLCipher `cipher_memory_security` 必须启用，否则拒绝连接。

## 不包含的设计

- 无主密码、Argon2/KDF、KEK/DEK 用户密码包装或安全头。
- 无锁定、解锁、自动锁定、失焦锁定或 Windows 生命周期锁定。
- 无跨用户、跨设备密钥导出或恢复口令。

## 失败边界

DPAPI 文件缺失/篡改、用户不匹配、数据库篡改、文件对不完整或版本不兼容均停止写入。失败路径不得创建空数据库覆盖现有文件。
