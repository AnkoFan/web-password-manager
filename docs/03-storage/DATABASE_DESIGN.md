# 数据库设计

> 用途说明：确定本地数据库选型、加密边界、逻辑表结构、完整性约束、索引、事务、软删除、迁移、备份和连接安全策略。
>
> 状态：Windows SQLCipher 业务仓储已实现并通过原生测试
>
> 最后更新日期：2026-07-30

## 1. 选型结论

MVP 候选：

- 数据库：SQLite。
- 静态加密：SQLCipher。
- Rust 访问：`rusqlite` 或维护状态、许可证和 SQLCipher 支持符合要求的等价库。
- 模式：本地单用户、单进程、单保险库。
- 密钥：使用随机 256 位 DEK，以 SQLCipher 原始密钥方式打开。
- 主密码：不直接传给 SQLCipher，由 Argon2id 和 AEAD 分层方案处理。

### 1.1 第一阶段原型状态

2026-07-30 已在 `src-tauri` 实现首个 Windows 原型：

- `rusqlite` 使用 `bundled-sqlcipher-vendored-openssl`，目标是把 SQLCipher 与 OpenSSL 静态包含进桌面构建。
- 安全头保存版本化 Argon2id 参数、随机盐、包装算法、nonce 和包装后的 DEK。
- 数据库只接收随机 256 位 DEK，不接收主密码。
- 创建过程先写入 `.creating` 临时文件，成功后再移动为有效保险库。
- 锁定通过关闭并丢弃 SQLCipher 连接实现。
- 原型测试将检查数据库文件头不是明文 SQLite 标识。

Cargo 原生编译、错误主密码、跨进程重启解锁、数据库非明文文件头和首个安装包运行已完成验证。业务 schema 已升级到 v2，迁移 002 删除 `demo_fields`；`metadata` 仅保留为保险库内部标记。

在冻结技术方案前必须完成 Windows 原型，验证：

- SQLCipher 可以稳定静态链接或随安装包正确部署。
- 只有一个 `Setup.exe` 安装入口。
- 数据库创建、重启解锁、备份和迁移正常。
- 许可证与开源发布兼容。
- 正式数据库及日志中不存在测试明文秘密。

## 2. 选择 SQLite + SQLCipher 的理由

- 完全本地，不需要数据库服务。
- 支持事务、外键、索引和成熟迁移方式。
- 单用户桌面应用的规模和并发需求匹配。
- SQLCipher 对数据库页面和辅助日志提供透明加密与完整性保护。
- Rust 和桌面打包生态具备可行集成路径。

代价：

- Windows 构建和原生依赖比纯 SQLite 复杂。
- 必须固定 SQLCipher 兼容版本和参数。
- 数据库密钥存在于解锁进程内存。
- 数据库结构和查询仍需防止逻辑越权。

## 3. 存储边界

```text
vault/
├─ header       安全头、KDF 参数、包装后的 DEK
└─ vault.db     SQLCipher 加密数据库
```

- `header` 与 `vault.db` 共同组成一个逻辑保险库。
- 业务表、用户名、网址、字段标签和值全部位于加密数据库。
- 安全头不保存用户内容。
- 配置和日志与保险库分开。
- 备份必须同时包含安全头和数据库一致性快照。

是否最终打包为单文件容器，在原型后决定。

## 4. 物理类型约定

初始建议：

| 逻辑类型 | SQLite 类型 | 说明 |
| --- | --- | --- |
| `EntityId` | `BLOB(16)` | 随机 UUID v4 字节 |
| 名称和文本 | `TEXT` | UTF-8 |
| 布尔值 | `INTEGER` | `0` 或 `1`，使用 CHECK |
| 时间戳 | `INTEGER` | UTC Unix 毫秒 |
| 排序 | `INTEGER` | 同级非负整数 |
| 版本 | `INTEGER` | 单调正整数 |
| 字段值 | `TEXT` | SQLCipher 内受保护 |

选择 UUID v4 的理由：

- 不泄露创建时间。
- 可离线生成。
- 迁移和备份中保持稳定。
- 不使用名称或网址作为标识。

## 5. 核心表

### 5.1 `vault_meta`

单行逻辑元数据：

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | BLOB(16) | 主键 |
| `display_name` | TEXT | 非空 |
| `data_model_version` | INTEGER | 非空 |
| `created_at` | INTEGER | 非空 |
| `updated_at` | INTEGER | 非空 |

不保存主密码、KEK 或 DEK。

### 5.2 `categories`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | BLOB(16) | 主键 |
| `vault_id` | BLOB(16) | 非空，引用 `vault_meta` |
| `name` | TEXT | 非空 |
| `name_key` | TEXT | 非空，用于规范化唯一比较 |
| `sort_order` | INTEGER | 非空，非负 |
| `created_at` | INTEGER | 非空 |
| `updated_at` | INTEGER | 非空 |
| `deleted_at` | INTEGER | 可空 |
| `deletion_group_id` | BLOB(16) | 可空 |

活跃分类的 `name_key` 在保险库范围内唯一。

### 5.3 `websites`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | BLOB(16) | 主键 |
| `vault_id` | BLOB(16) | 非空 |
| `category_id` | BLOB(16) | 非空，引用分类 |
| `name` | TEXT | 非空 |
| `name_key` | TEXT | 非空，用于搜索和提示 |
| `primary_url` | TEXT | 可空 |
| `icon_ref` | TEXT | 可空 |
| `sort_order` | INTEGER | 非空，非负 |
| `created_at` | INTEGER | 非空 |
| `updated_at` | INTEGER | 非空 |
| `deleted_at` | INTEGER | 可空 |
| `deletion_group_id` | BLOB(16) | 可空 |

网站名称允许重复，因此 `name_key` 不设唯一约束。

### 5.4 `accounts`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | BLOB(16) | 主键 |
| `vault_id` | BLOB(16) | 非空 |
| `website_id` | BLOB(16) | 非空，引用网站 |
| `display_name` | TEXT | 非空 |
| `display_name_key` | TEXT | 非空 |
| `sort_order` | INTEGER | 非空，非负 |
| `created_at` | INTEGER | 非空 |
| `updated_at` | INTEGER | 非空 |
| `deleted_at` | INTEGER | 可空 |
| `deletion_group_id` | BLOB(16) | 可空 |

活跃账号的 `display_name_key` 在同一网站内唯一。

### 5.5 `account_fields`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | BLOB(16) | 主键 |
| `account_id` | BLOB(16) | 非空，引用账号 |
| `system_role` | TEXT | 可空 |
| `label` | TEXT | 非空 |
| `label_key` | TEXT | 非空 |
| `field_type` | TEXT | 非空 |
| `value` | TEXT | 非空，允许空字符串 |
| `is_sensitive` | INTEGER | 非空，0 或 1 |
| `sort_order` | INTEGER | 非空，非负 |
| `created_at` | INTEGER | 非空 |
| `updated_at` | INTEGER | 非空 |

约束：

- `label_key` 在同一账号内唯一。
- 非空 `system_role` 在同一账号内唯一。
- `password` 角色或类型必须 `is_sensitive = 1`。
- 字段不单独软删除；随账号回收或在账号事务中物理移除。

### 5.6 `deletion_groups`

| 列 | 类型 | 约束 |
| --- | --- | --- |
| `id` | BLOB(16) | 主键 |
| `root_entity_type` | TEXT | 非空 |
| `root_entity_id` | BLOB(16) | 非空 |
| `deleted_at` | INTEGER | 非空 |

用途：

- 标识一次级联软删除。
- 恢复时只恢复同批次对象。
- 清空回收站时确定物理清理范围。

表中不保存对象名称或字段值。

## 6. 未来表

不进入 MVP 物理结构：

- `tags`
- `website_tags`
- `account_tags`
- `templates`
- `template_fields`
- `attachments`
- `favorites`

确定需求后通过迁移添加，避免创建长期空表。

## 7. 完整性约束

数据库必须启用外键：

```sql
PRAGMA foreign_keys = ON;
```

逻辑约束：

- 网站分类与网站的 `vault_id` 相同。
- 账号网站与账号的 `vault_id` 相同。
- 字段通过账号间接属于同一保险库。
- 活跃子对象不能引用已永久清除父对象。
- 软删除父对象时子对象在同一事务中标记。

SQLite 的简单外键不能表达所有跨列保险库约束，因此应用领域层和数据库事务都要校验。必要时使用复合外键或触发器，但优先保持结构可理解。

## 8. 唯一索引

建议使用活跃对象部分唯一索引：

```sql
CREATE UNIQUE INDEX ux_categories_active_name
ON categories(vault_id, name_key)
WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_accounts_active_name
ON accounts(website_id, display_name_key)
WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX ux_fields_label
ON account_fields(account_id, label_key);

CREATE UNIQUE INDEX ux_fields_system_role
ON account_fields(account_id, system_role)
WHERE system_role IS NOT NULL;
```

回收站恢复发生唯一冲突时由应用要求用户选择新名称，不能静默修改。

## 9. 查询索引

MVP 建议：

```text
categories(vault_id, deleted_at, sort_order)
websites(category_id, deleted_at, sort_order)
websites(name_key)
accounts(website_id, deleted_at, sort_order)
accounts(display_name_key)
account_fields(account_id, sort_order)
account_fields(system_role)
deletion_groups(deleted_at)
```

不为密码、Token 或敏感字段创建独立持久化明文索引。

所有索引页面仍由 SQLCipher 加密，但索引设计继续遵守最小化原则。

## 10. 搜索

MVP 搜索范围：

- 分类 `name_key`。
- 网站 `name_key`。
- 账号 `display_name_key`。
- 非敏感 `username` 和 `email` 角色字段。

字段值不建立独立规范化持久列。初期可以：

- 先用角色和敏感属性筛选少量候选。
- 在 SQLCipher 解锁连接或 Rust 应用内进行规范化匹配。
- 根据真实性能数据决定是否增加加密数据库内搜索辅助列。

任何优化不能把秘密写到数据库外部索引。

## 11. 事务

必须使用事务：

- 创建账号及初始字段。
- 编辑账号及字段集合。
- 重排同级对象。
- 删除分类及全部后代。
- 删除网站及账号和字段。
- 恢复删除批次。
- 永久清空删除批次。
- 数据迁移。

原则：

- 事务成功提交后才返回成功。
- 错误回滚。
- 不在事务中等待用户输入。
- 平台剪贴板和浏览器操作不放入数据库事务。

## 12. 并发

MVP：

- 单应用进程。
- 一个主要写连接。
- 有界只读查询。
- 不支持多个应用实例同时写同一保险库。
- 启动时使用进程或文件锁阻止第二写实例。

是否允许第二实例只读打开，首版不实现。

`revision` 乐观并发字段暂不进入 MVP；同一进程通过应用层编辑会话检测旧版本覆盖。

## 13. 日志模式

初始建议先使用 SQLite 默认回滚日志模式，理由：

- 单进程并发需求低。
- 备份和文件集合更简单。
- 减少需要协调的长期辅助文件。

在性能或响应性测试证明需要后，再评估 WAL。启用 WAL 前必须验证：

- SQLCipher 对 WAL 的加密与完整性行为。
- 锁定和备份时 checkpoint。
- 异常退出恢复。
- 安装和杀毒软件环境兼容性。

## 14. 连接初始化

顺序必须固定：

1. 打开数据库文件。
2. 立即设置 SQLCipher 原始密钥和显式兼容参数。
3. 验证密钥和数据库头。
4. 启用外键。
5. 设置忙等待和安全连接选项。
6. 检查 `user_version` 与迁移表。
7. 执行快速完整性检查。
8. 建立仓储。

不能在设置密钥前查询业务表。

候选设置需按实际 SQLCipher 版本验证：

- `foreign_keys = ON`
- `busy_timeout`
- `secure_delete = ON` 或经测试的等价策略
- `trusted_schema = OFF`，如依赖与迁移兼容

不复制未经验证的 PRAGMA 清单。

## 15. 迁移

版本来源：

- SQLite `user_version`。
- `schema_migrations` 表记录应用迁移编号、时间和校验标识。

流程：

1. 解锁并验证数据库。
2. 创建加密备份或恢复点。
3. 在事务中执行迁移。
4. 验证表、索引、外键和业务关系。
5. 成功后更新版本。
6. 失败时回滚并保留原保险库。

重大加密格式变化不只属于数据库迁移，由保险库容器迁移处理。

## 16. 备份

- 使用 SQLite 备份 API 或已验证的一致性快照方式。
- 备份过程中数据库保持加密。
- 与对应安全头一起复制。
- 复制完成后在独立临时目录测试解锁和完整性。
- 不直接复制正在写入且状态不明的文件集合。

## 17. 软删除与清理

- 普通查询强制过滤 `deleted_at IS NULL`。
- 回收站查询只读取已删除根对象和删除批次。
- 级联软删除在一个事务中完成。
- 永久清理后运行必要压缩由维护策略决定。
- `secure_delete` 只能作为补充，不能承诺 SSD 物理不可恢复。
- 备份中的旧数据不受当前清理影响。

## 18. 数据库错误

| 错误 | 应用行为 |
| --- | --- |
| 错误 DEK | 保持锁定，统一解锁失败 |
| 数据库损坏 | 停止写入，提供恢复入口 |
| 版本过新 | 拒绝写入，提示升级 |
| 迁移失败 | 回滚并保留恢复点 |
| 磁盘满 | 回滚，不提示成功 |
| 文件被占用 | 提示关闭其他实例 |
| 外键失败 | 视为业务或完整性错误 |

不能把任何错误静默解释为“没有数据”。

## 19. 性能目标

初始数据规模：

- 1 个保险库。
- 1,000 个分类以内。
- 100,000 个网站和账号组合以内。
- 单账号 500 个字段以内。
- 单字段遵守数据验证上限。

实际日常规模预计远低于上限。性能优化以测量为依据，不提前反规范化敏感数据。

目标：

- 常见分类和网站列表在用户感知上即时。
- 10,000 个账号规模的基础搜索保持可用。
- 账号保存使用单一短事务。
- KDF 耗时与数据库查询耗时分开测量。

## 20. 数据库测试

- [x] 错误密钥不能读取。
- [x] 篡改数据库字节能够检测。
- [x] 外键和唯一索引生效。
- [x] 账号与字段事务失败完整回滚。
- [x] 级联软删除和按批次恢复正确。
- [x] 关闭连接并重新打开后最后有效提交可读取。
- [x] 迁移失败完整回滚。
- [x] 加密备份可以在独立目录验证并恢复。
- [ ] 数据库及辅助文件不含测试明文秘密。
- [ ] 第二写实例被拒绝。

## 21. 待决策事项

- [x] Windows 原型确定 SQLCipher 和 Rust 绑定版本。
- [ ] 确定 SQLCipher 显式兼容和安全参数。
- [ ] 确定保险库目录或单文件容器。
- [ ] 确定 `secure_delete` 和压缩策略。
- [ ] 测试后决定默认回滚日志或 WAL。
- [ ] 确定应用级单实例锁实现。
- [x] 完成正式 `DATABASE_SCHEMA.md` 和迁移 001/002。

## 22. 相关文档

- [数据库结构](DATABASE_SCHEMA.md)
- [存储架构](STORAGE_ARCHITECTURE.md)
- [迁移策略](MIGRATION_STRATEGY.md)
- [备份与恢复](BACKUP_AND_RESTORE.md)
- [数据模型](../02-domain-and-data/DATA_MODEL.md)
- [数据验证](../02-domain-and-data/DATA_VALIDATION.md)
- [数据生命周期](../02-domain-and-data/DATA_LIFECYCLE.md)
- [加密设计](../04-security/ENCRYPTION_DESIGN.md)
