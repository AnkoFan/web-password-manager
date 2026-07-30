# 设置模块

> 状态：M2.5 安全设置已实现

设置页提供：

- 空闲自动锁定：1、5、10、15、30 或 60 分钟。
- 窗口失焦、系统锁屏或休眠进入时立即锁定。
- 剪贴板条件清理：5、15、30、60、120 或 300 秒。
- 查看最近本机备份并创建新备份。

设置由 Rust 校验并原子写入应用数据目录的 `security-settings.json`。文件不包含主密码、密钥或业务内容；缺失或无效时使用更安全的默认值（5 分钟、30 秒、失焦锁定）。

相关实现：`src-tauri/src/security_controls.rs`、`src/features/vault/components/SecuritySettingsView.tsx`。
