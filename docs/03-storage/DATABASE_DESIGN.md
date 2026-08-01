# 数据库设计

> 状态：普通 bundled SQLite 已实现
>
> 最后更新：2026-08-01

## 选型与文件

- 数据库：SQLite，通过 `rusqlite` 的 `bundled` 特性编译。
- 模式：本地单用户、单进程、单活动数据库。
- 活动文件：应用数据目录中的 `password-manager.db`。
- 静态加密：无。
- 主密码、密钥、KDF 和安全头：无。

新文件名确保旧 `vault.db` 与 `vault.header.json` 不会被自动迁移或覆盖。数据库包含 `plaintext-local-database-v1` 应用标记，用于拒绝无关 SQLite 文件。

## 逻辑结构

当前 schema v2 包含：

- `metadata`：应用标记与 schema 元数据；
- `vault_meta`：单一逻辑数据集标识；
- `categories`：分类、排序和软删除字段；
- `websites`：网址、分类关系、排序和软删除字段；
- `accounts`：网站下多账号、排序和软删除字段；
- `account_fields`：系统角色、自定义标签、字段类型、值和敏感标记；
- `deletion_groups`：级联删除批次与恢复元数据。

名称规范化键、外键、唯一约束、CHECK 约束和事务规则继续适用。敏感字段的“敏感”只控制界面遮挡和响应最小化，不代表磁盘加密。

## 打开与验证

每次打开启用外键并验证：

1. `PRAGMA integrity_check`；
2. 应用标记与 schema 版本；
3. 必需表存在；
4. `vault_meta` 只有一行。

不兼容或损坏的现有 `password-manager.db` 不会被当作空数据库重建。

## 写入与恢复

- 多对象变更使用 SQLite 事务。
- 软删除和恢复按 `deletion_group_id` 保持原子性。
- 备份使用 SQLite 一致性副本，不直接复制活动数据库字节。
- 恢复采用暂存、回滚副本和重新打开验证。

## 安全限制

文件头应为 `SQLite format 3`，普通 SQLite 工具可以读取全部表和字段。项目仅允许虚构测试数据。
