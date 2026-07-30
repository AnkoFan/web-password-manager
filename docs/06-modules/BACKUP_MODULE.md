# 备份模块

> 状态：M2.5 本机加密备份已实现

模块提供 `list_backups`、`create_backup`、`verify_backup` 和 `restore_backup` 四个最小命令。创建备份会关闭当前连接并保持锁定；恢复只允许从锁定状态开始，成功后使用已验证连接进入解锁状态。

备份格式、摘要清单、回滚边界和限制见[备份与恢复](../03-storage/BACKUP_AND_RESTORE.md)。
