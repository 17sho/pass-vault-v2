# Cloudflare 部署指南（Workers + Static Assets + D1）

[中文](cloudflare-deployment.zh-CN.md) · [English](cloudflare-deployment.en.md) · [返回首页](../README.md)

本指南仅讲 Cloudflare 部署。请把 `<...>` 替换成实际值；真实账户 ID、D1 ID、token 和域名不要提交到公开仓库。

## 要求与架构

- Node.js 22+、npm、Git，以及启用 Workers/D1 的 Cloudflare 账户。
- CLI 路线需要 Wrangler 登录；Dashboard 路线需要 GitHub 仓库连接或上传/构建能力。

```text
浏览器 ──HTTPS──> Cloudflare Worker
                       ├─ /api/* → Worker → D1 binding: DB
                       └─ 其他   → Workers Static Assets (dist/)
```

首次操作前在仓库根目录运行：

```bash
npm ci
npm test && npm run lint && npm run typecheck && npm run build
```

## 1. Wrangler CLI 部署

### 1.1 登录、创建 D1、设置配置

```bash
npx wrangler login
npx wrangler whoami
cd apps/worker
npx wrangler d1 create <D1_DATABASE_NAME>
```

复制返回的 `database_id`。编辑 `apps/worker/wrangler.jsonc`：

- `name` 改为 `<WORKER_NAME>`；
- `d1_databases` 中 binding 保持 `DB`，设置真实 `database_name`/`database_id`；
- `migrations_dir` 保持 `migrations`；
- Assets 目录保持 `../../dist`，`run_worker_first` 保持 `true`；
- 删除示例 route，或替换为自己的域名。公开分支应保留占位配置，实际值放在不提交的配置副本或 CI secrets 中。

### 1.2 migration、构建、发布

```bash
# apps/worker/
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote
npx wrangler d1 migrations apply <D1_DATABASE_NAME> --remote
cd ../..
npm run build
npx wrangler deploy --config apps/worker/wrangler.jsonc
npx wrangler versions list --config apps/worker/wrangler.jsonc
curl -fsS https://<WORKER_SUBDOMAIN>/api/health
```

每次 schema 变更只新增 migration，绝不重写已在远程执行的文件。

### 1.3 自定义域

在配置中添加（具体字段以当前 Wrangler schema 为准）：

```json
"routes": [{ "pattern": "<APP_DOMAIN>", "custom_domain": true }]
```

重新部署；或在 Dashboard 的 Worker **Settings → Domains & Routes → Add → Custom Domain** 添加。等待 DNS/证书生效后验证主页与 `/api/health`。

## 2. Cloudflare Dashboard 部署

Dashboard 菜单名称可能调整；以当前界面为准。

1. **Storage & Databases → D1 → Create database**，创建 `<D1_DATABASE_NAME>`。
2. **Workers & Pages → Create → Import a repository**，连接 `<GITHUB_REPOSITORY>`，选择 `<PRODUCTION_BRANCH>`。
3. Root directory 设为仓库根目录；Build command 设为 `npm ci && npm run build`。
4. 这不是纯静态 Pages：必须部署 Worker API 并附加 Workers Static Assets。若界面支持 deploy command，设为 `npx wrangler deploy --config apps/worker/wrangler.jsonc`；若导入流程不能识别 Worker main/Assets/D1，请使用 Cloudflare CI/GitHub Actions 调 Wrangler，而不是发布成纯 Pages。
5. Worker **Settings → Bindings → Add → D1 database**：变量名必须为 `DB`，选择目标数据库。
6. 初始化数据库：优先从受控终端运行 Wrangler migrations。若必须使用 D1 **Console**，按顺序执行 `apps/worker/migrations/` 中尚未执行的 SQL，执行后检查表；不要重复非幂等 migration。
7. 确认 Assets 指向构建出的 `dist/`，且 API 请求先经过 Worker。
8. **Settings → Domains & Routes** 添加 `<APP_DOMAIN>`，完成 DNS 和证书。
9. CI 中把最小权限 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 存为加密 secrets；不得写进仓库或日志。

## 3. 发布后验证

```bash
curl -fsS https://<APP_DOMAIN>/api/health
curl -fsSI https://<APP_DOMAIN>/
```

用可清理测试账户验证注册、登录/解锁、CSRF 拒绝、密文条目增删、加密备份导入/导出与退出。不要使用真实秘密，不要用宽泛条件删除用户。

## 4. 升级、备份、恢复与回滚

升级前导出 D1 并确认文件非空：

```bash
cd apps/worker
npx wrangler d1 export <D1_DATABASE_NAME> --remote --output=<SAFE_BACKUP_PATH>/d1-<TIMESTAMP>.sql
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote
cd ../..
npm ci && npm test && npm run lint && npm run typecheck && npm run build
npx wrangler d1 migrations apply <D1_DATABASE_NAME> --remote --config apps/worker/wrangler.jsonc
npx wrangler deploy --config apps/worker/wrangler.jsonc
```

限制备份权限并异地保存。恢复时优先新建 D1，导入并验证，再切换 `DB` binding，避免覆盖正在写入的库：

```bash
npx wrangler d1 create <RESTORE_DATABASE_NAME>
npx wrangler d1 execute <RESTORE_DATABASE_NAME> --remote --file=<SAFE_BACKUP_PATH>/<BACKUP_FILE>.sql
```

代码回滚：

```bash
npx wrangler versions list --config apps/worker/wrangler.jsonc
npx wrangler rollback <KNOWN_GOOD_VERSION_ID> --config apps/worker/wrangler.jsonc
```

**Worker 版本回滚不会回滚 D1。** 对不兼容 migration，应停止写入并切换到已验证的恢复库，或使用经审查的前向修复 migration。Dashboard 恢复也应新建 D1，在 Console 执行已审查 SQL（大型导出使用 CLI），验证后切换 binding。

## 5. 安全与故障排查

- Cloudflare 账户启用 MFA；API token 最小权限、定期轮换；保护 GitHub/CI。
- 生产仅 HTTPS；备份加密、限权、异地保存并演练恢复。
- 不记录或分享密码、vault key、条目明文、完整密文、Cookie/token。

| 症状 | 检查 |
|---|---|
| `DB` 未定义 | binding 名严格为 `DB`；当前环境/版本绑定到正确 D1 |
| `no such table` | migration 是否对 `--remote` 目标完整执行 |
| 静态 404/旧页面 | `npm run build`、Assets=`dist/`、部署版本和缓存 |
| Dashboard 只有静态站 | 改用 Worker + Assets 的 Wrangler/CI，不要用纯 Pages 代替 API |
| 登录后立即退出 | HTTPS、系统时钟、Cookie/域名是否一致 |
| 403/CSRF | 同源访问、Cookie 是否发送、自定义域是否一致 |
| 回滚后异常 | 代码与 D1 schema 兼容性；版本回滚不等于数据库回滚 |
