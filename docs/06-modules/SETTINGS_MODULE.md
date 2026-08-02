# 设置模块

> 状态：M3 DPAPI 自动打开设置已实现

设置页提供：

- 说明 Windows 当前用户 DPAPI 自动保护随机 SQLCipher 数据库密钥。
- 说明应用没有主密码、锁定或解锁功能。
- 说明 DPAPI 备份通常不能跨 Windows 用户或设备恢复。
- 剪贴板条件清理：由 Rust 校验允许范围，并仅在内容仍匹配应用写入值时清除。
- 创建加密本地备份和从已验证备份恢复。

设置由 Rust 校验并写入应用数据目录。配置不包含数据库密钥、DPAPI 明文材料或业务内容；缺失或无效时使用安全默认值。

相关实现：`src-tauri/src/settings.rs`、`src/features/vault/components/SettingsView.tsx`。
