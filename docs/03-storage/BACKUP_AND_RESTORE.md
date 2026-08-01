# 备份与恢复

> 状态：DPAPI/SQLCipher 本机加密备份
>
> 最后更新：2026-08-01

## 格式

```text
dpapi-backups/<backup-id>/
├─ manifest.json
├─ password-manager.dpapi.db
└─ password-manager.dpapi-key
```

数据库通过 `sqlcipher_export` 生成一致的加密副本。密钥文件仍由创建备份的 Windows 用户 DPAPI 保护。清单记录两个文件的长度、SHA-256、schema、备份 ID 和创建时间。

## 验证

恢复前验证目录/清单 ID、长度、摘要、DPAPI 解密、SQLCipher 密文完整性、SQLite 逻辑完整性、schema 和应用标记。摘要检测意外损坏；SQLCipher 与 DPAPI 提供加密和用户绑定边界。

## 恢复

数据库与密钥先复制到暂存文件并重新打开验证，再为当前两个文件创建回滚副本。只有两个暂存文件都提交且自动打开成功后才删除回滚副本；失败时恢复原组合。

## 限制

- 备份通常只能由拥有原 Windows DPAPI 用户凭据的配置文件恢复。
- 单设备备份不能防止磁盘整体损坏、勒索软件或设备丢失。
- 必须成对保留数据库和 DPAPI 密钥文件。
- 不读取旧明文备份或旧主密码加密备份。
