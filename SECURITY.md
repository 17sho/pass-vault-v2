# Security Policy / 安全政策

## Reporting a vulnerability / 报告漏洞

请勿通过公开 Issue、讨论区、日志或截图披露漏洞、真实数据、密钥、数据库或可利用细节。请通过仓库维护者配置的私密安全报告渠道（例如 GitHub **Security → Report a vulnerability**）提交；若该渠道尚未启用，请联系维护者索取私密联系方式。

Do not disclose vulnerabilities, real data, secrets, databases, or exploit details in public issues, discussions, logs, or screenshots. Use the repository's private security-reporting channel (for example, GitHub **Security → Report a vulnerability**). If it is not enabled, ask the maintainer for a private contact method.

报告应包含 / Include:

- 受影响版本或 commit / affected version or commit
- 部署类型（Cloudflare 或 Linux）/ deployment type
- 最小复现步骤和影响 / minimal reproduction and impact
- 可安全分享的日志（先脱敏）/ redacted logs safe to share
- 建议修复（可选）/ suggested mitigation, if any

维护者应确认收件、评估影响，并在修复可用前协调披露。请给予合理修复时间。/ Maintainers should acknowledge receipt, assess impact, and coordinate disclosure after a fix is available. Please allow reasonable remediation time.

## Scope and operational guidance / 范围与运维建议

- 当前受支持范围以最新发布版本为准；旧版应升级后再复现。
- 主密码、vault key 与条目明文不应到达服务端。
- 生产环境必须使用 HTTPS、安全 Cookie、最小权限账户与受保护备份。
- 不要提交 `.env`、SQLite/D1 导出、真实域名、账户 ID、token 或截图中的用户数据。
- 零知识设计不能防御恶意前端、浏览器扩展、键盘记录器或已被攻陷的终端。

- Support targets the latest release; reproduce on it when possible.
- Master passwords, vault keys, and item plaintext must not reach the server.
- Production requires HTTPS, secure cookies, least-privilege accounts, and protected backups.
- Never commit `.env`, SQLite/D1 exports, real domains, account IDs, tokens, or user data in screenshots.
- Zero knowledge does not protect against a malicious frontend, browser extension, keylogger, or compromised endpoint.
