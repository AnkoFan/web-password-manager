# 保险库模块

> 状态：M3 DPAPI + SQLCipher 自动打开闭环已实现

保险库模块负责：

- 检查 SQLCipher 数据库与 DPAPI 密钥文件是否成对存在。
- 首次创建时生成随机 256 位数据库密钥，并使用当前 Windows 用户 DPAPI 保护。
- 后续启动时由 DPAPI 自动解开密钥，完成 SQLCipher 完整性、保险库标记和 schema 检查。
- 文件对不完整、DPAPI 不匹配、数据库损坏或版本不兼容时安全停止且不覆盖文件。
- 为分类、网站、账号、搜索、回收站和备份命令提供已验证的数据库连接。
- 应用退出时关闭连接并释放可控的运行期敏感状态。

当前产品没有主密码、锁定、解锁、自动锁定或生命周期锁定状态。React 只根据保险库启动结果显示主界面或安全错误状态。

详细规则见[保险库无锁定边界](../04-security/VAULT_LOCKING.md)与 [ADR-014](../00-foundation/12-ADR_DPAPI_SQLCIPHER_AUTO_OPEN.md)。
