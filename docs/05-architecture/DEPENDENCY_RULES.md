# 依赖规则

> 状态：基础规则已确定  
> 最后更新日期：2026-07-30

## 允许

- `app` 调用 `features` 和 `services`。
- `features` 调用 `components/ui`、`lib` 和 `services`。
- `services` 调用 Tauri API；浏览器原型必须放在独立开发文件中。
- Rust `commands` 调用 `storage`；`storage` 调用 `security`。

## 禁止

- `components/ui` 导入任何业务模块。
- React 页面直接调用 SQL、文件系统或加密库。
- Rust 存储或安全模块依赖 Tauri 窗口和界面组件。
- 正式运行路径导入浏览器演示保险库。
- 模块通过内部私有文件绕过公开入口。

新增依赖时应遵循上面的单向关系；出现反向引用时先调整职责，而不是增加循环引用。
