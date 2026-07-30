# 项目结构

> 用途说明：定义源码目录职责和模块依赖边界。
>
> 状态：第二阶段 M2.4 已完成
>
> 最后更新日期：2026-07-30

## 1. 目录树

```text
.
├─ src/
│  ├─ app/                    # 应用会话编排
│  ├─ components/ui/          # shadcn/ui 基础组件
│  ├─ features/vault/         # 保险库界面模块
│  ├─ lib/                    # 无业务含义的通用工具
│  └─ services/               # 前端到 Tauri 的类型化适配层
├─ src-tauri/
│  ├─ capabilities/           # Tauri 最小权限
│  ├─ icons/                  # 桌面与安装包图标
│  ├─ src/
│  │  ├─ commands.rs         # Tauri 命令、会话检查和外部错误边界
│  │  ├─ domain.rs           # 稳定标识、值对象和领域规则
│  │  ├─ repositories.rs     # SQLCipher 业务仓储与事务
│  │  ├─ repositories/
│  │  │  └─ vault_repository.rs # 网站、账号、搜索、删除与恢复
│  │  ├─ security.rs         # 密钥派生、包装与清理
│  │  ├─ storage.rs          # 文件、连接、结构和迁移
│  │  ├─ tests.rs            # 跨模块与跨进程验收
│  │  └─ lib.rs              # Tauri 启动与组装
│  ├─ Cargo.toml
│  └─ tauri.conf.json
├─ docs/                      # 项目文档库
└─ package.json
```

## 2. 依赖方向

```text
features → services → Tauri commands
features → components/ui
app → features
Rust commands → repositories → domain
Rust commands → storage → security
repositories → storage schema / domain
```

禁止：

- UI 组件直接访问数据库。
- React 组件保存主密码或明文密码到持久化存储。
- Rust 返回完整保险库对象给前端。
- 模块互相导入内部实现文件。

## 3. Rust 模块现状

当前 Rust 端结构：

```text
src-tauri/src/
├─ commands.rs              # Tauri 命令和错误边界
├─ domain.rs                # 领域类型、名称规范化和规则
├─ repositories.rs          # 业务查询与事务边界
├─ security.rs              # 密钥派生与包装
├─ storage.rs               # 文件、SQLCipher、版本检查和迁移
├─ tests.rs                 # 跨模块测试
└─ lib.rs                   # 启动与组装
```

`domain` 和 `repositories` 已覆盖分类、网站、账号、字段、搜索、软删除和恢复。仓储保持不依赖 Tauri DTO 或 React 展示模型。

## 4. 待完善章节

- [ ] 明确模块公共 API 命名
- [x] 增加基础架构依赖自动检查
- [ ] 增加测试目录与夹具规范
