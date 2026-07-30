# GitHub 首次连接与推送

> 状态：已完成首次连接与推送准备

## 仓库信息

- 仓库：`AnkoFan/web-password-manager`
- 地址：`https://github.com/AnkoFan/web-password-manager`
- 可见性：私有
- 默认分支：`main`
- 提交身份：`AnkoFan <168768984+AnkoFan@users.noreply.github.com>`

使用 GitHub noreply 邮箱可以关联贡献记录，同时避免公开私人邮箱。不要在聊天、提交、远程地址或配置文件中粘贴 PAT、私钥或密码。

## 首次推送命令

```powershell
git config user.name "AnkoFan"
git config user.email "168768984+AnkoFan@users.noreply.github.com"
git remote add origin https://github.com/AnkoFan/web-password-manager.git
git remote -v
git push -u origin main
git push origin --tags
```

如果远程仓库不是空的，不强制推送；先读取远程历史，再决定合并方式。

## 推送后检查

- 检查 Frontend、Rust and SQLCipher、RustSec 三个 Actions。
- 把这些检查设置为 `main` 分支合并门禁。
- 启用阻止强制推送和删除分支。
- 根据仓库公开性决定是否启用 Dependabot 和 secret scanning。
- 首次 RustSec 未通过时先处理告警，不添加无说明的忽略项。
