# WebPasswordManager 0.6.0-bate 发布说明

## 本次更新

- 新建网站时，输入 HTTP/HTTPS 地址并移开焦点后自动读取网站名称。
- 依次使用 `og:site_name`、`application-name`、网页标题和域名作为名称来源。
- 自动识别不会覆盖用户手动输入的网站名称。
- 网站读取限制为 8 秒、3 次重定向和 512 KiB HTML，拒绝不受支持的协议及带凭据网址。

## GitHub Packages

Windows x64 NSIS 安装程序封装在：

`ghcr.io/ankofan/web-password-manager:0.6.0-bate`

该容器包仅作为 GitHub Packages 分发载体，安装程序位于镜像的 `/packages/` 目录。

## 安全说明

该版本仍未经过独立安全审计，只应用于虚构测试数据，不要保存真实密码、Token、恢复码或其他重要凭据。
