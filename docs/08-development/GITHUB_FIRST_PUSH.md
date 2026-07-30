# GitHub 首次连接与推送

> 状态：首次连接、推送与 CI 验证已完成

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

- [x] `main`、`m2.5-internal` 和 `m2.6-internal` 已推送。
- [x] Frontend、Rust and SQLCipher、RustSec 与 Security audit 全部通过。
- [x] Linux/Windows 跨平台 `npm ci` 已验证。
- [ ] 仓库公开后把必需检查设为 `main` 合并门禁，并阻止强制推送和删除。
- [ ] 仓库公开后复核 Dependabot、secret scanning 和公开仓库安全设置。

当前仓库保持私有。GitHub Free 不支持私有仓库分支保护，因此保护规则按决定延期到仓库公开后配置；延期不改变“仅使用虚构测试数据”的限制。
