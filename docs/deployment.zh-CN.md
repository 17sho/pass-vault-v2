# 部署指南

[中文](deployment.zh-CN.md) · [English](deployment.en.md) · [返回首页](../README.md)

本文只使用占位符。执行前替换 `<...>`，不要把真实域名、D1 ID、账户 ID、token、数据库或备份提交到仓库。

## 1. 先决条件与结构

- Git、Node.js **22+**、npm；Cloudflare 路线另需有 Workers/D1 权限的账户与 Wrangler 登录。
- Linux 路线：Ubuntu/Debian、root/sudo、`sqlite3`、Caddy 或 Nginx。
- DNS 控制权、生产 HTTPS，以及独立的离线/异地备份位置。

```text
public/                 共享前端
shared/                 共享密文契约
apps/worker/src/        Worker API
apps/worker/migrations/ D1 migrations
apps/worker/wrangler.jsonc
apps/server/            Node + SQLite API
dist/                   npm run build 生成的静态资源
deploy/                 systemd 示例
```

首次部署前在仓库根目录：

```bash
npm ci
npm test && npm run lint && npm run typecheck && npm run build
```

## 2. Cloudflare CLI：Workers + Assets + D1

### 2.1 创建并绑定 D1

```bash
npx wrangler login
npx wrangler whoami
cd apps/worker
npx wrangler d1 create <D1_DATABASE_NAME>
```

复制命令返回的 `database_id`。编辑 `apps/worker/wrangler.jsonc`：将 `database_name`、`database_id` 换成 `<D1_DATABASE_NAME>`、`<D1_DATABASE_ID>`，保留 binding `DB`、`migrations_dir: "migrations"`；把 `name` 改为 `<WORKER_NAME>`。删除示例 `routes` 或替换为自己的 `<APP_DOMAIN>`。公开仓库应保留占位配置，真实配置可用不提交的部署副本或 CI 变量生成。

### 2.2 migration、构建和部署

```bash
# apps/worker/
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote
npx wrangler d1 migrations apply <D1_DATABASE_NAME> --remote
cd ../..
npm run build
cd apps/worker
npx wrangler deploy
npx wrangler versions list
curl -fsS https://<WORKER_SUBDOMAIN>/api/health
```

`assets.directory` 指向 `../../dist`，`run_worker_first` 让 API 先经过 Worker。每次 schema 变更只新增 migration，不重写已执行文件。

### 2.3 自定义域

可在 `wrangler.jsonc` 添加：

```json
"routes": [{ "pattern": "<APP_DOMAIN>", "custom_domain": true }]
```

重新 `npx wrangler deploy`，或在 Dashboard 的 Worker **Settings → Domains & Routes → Add → Custom Domain** 添加。等待证书生效后验证 HTTPS 与 `/api/health`。

### 2.4 升级、备份、恢复、回滚

升级前：

```bash
cd apps/worker
npx wrangler d1 export <D1_DATABASE_NAME> --remote --output=<SAFE_BACKUP_PATH>/d1-<TIMESTAMP>.sql
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote
cd ../.. && npm ci && npm test && npm run lint && npm run typecheck && npm run build
cd apps/worker && npx wrangler d1 migrations apply <D1_DATABASE_NAME> --remote && npx wrangler deploy
```

确认导出文件非空、限制权限并离线保存。恢复时推荐先创建新 D1，再导入并验证，避免覆盖正在写入的库：

```bash
npx wrangler d1 create <RESTORE_DATABASE_NAME>
npx wrangler d1 execute <RESTORE_DATABASE_NAME> --remote --file=<SAFE_BACKUP_PATH>/<BACKUP_FILE>.sql
```

随后把 binding 切到新 ID、部署并验证。代码回滚：

```bash
npx wrangler versions list
npx wrangler rollback <KNOWN_GOOD_VERSION_ID>
```

**代码回滚不会回滚 D1。** 不兼容 migration 应停止写入，切换到已验证的恢复库，或使用经审查的前向修复 migration。

## 3. Cloudflare Dashboard 网页部署

### 3.1 GitHub 与构建设置

1. 将无秘密的仓库连接到 **Workers & Pages → Create → Import a repository**，选择 `<GITHUB_REPOSITORY>` 与 `<PRODUCTION_BRANCH>`。
2. Root directory 设为仓库根目录；Build command 设为 `npm ci && npm run build`。
3. 本项目不是纯静态 Pages：API 依赖 Worker，静态资源依赖 Workers Static Assets。Dashboard 产品界面随时间变化，若导入流程不能识别 `apps/worker/wrangler.jsonc`、无法设置 Worker main/Assets/D1，**不要把它当纯 Pages 发布**。
4. 可行工作流：Dashboard 负责 GitHub 集成/构建，部署命令使用 `npx wrangler deploy --config apps/worker/wrangler.jsonc`（若界面支持）；否则使用 GitHub Actions/Cloudflare CI 调 Wrangler。另一种稳妥方式是 Dashboard 只管理资源和观察，CLI 部署 Worker+Assets。
5. 不要在构建日志或仓库配置中写 token。CI 使用最小权限的 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID` secrets。

### 3.2 Dashboard 创建 D1 与 binding

1. **Storage & Databases → D1 → Create database**，名称 `<D1_DATABASE_NAME>`。
2. Worker → **Settings → Bindings → Add → D1 database**；变量名必须是 `DB`，选择刚创建的数据库。
3. 在 D1 的 **Console** 中执行 `apps/worker/migrations/0001.sql` 的内容。逐个执行后检查表；不要重复执行非幂等 SQL。后续升级优先使用 Wrangler migrations，以保留 migration 状态。
4. 确认 Worker 的 Assets 指向构建出的 `dist/` 且 API 请求先到 Worker。Dashboard 若不能上传绑定 Assets，应改用上述 Wrangler/CI 工作流。
5. **Settings → Domains & Routes** 添加 `<APP_DOMAIN>`，完成 DNS/证书流程。
6. 验证主页、`https://<APP_DOMAIN>/api/health`、注册/登录、CSRF 拒绝、密文条目增删、加密备份导入导出与退出。只使用可清理的测试账户，绝不宽泛删除用户。

Dashboard 中的恢复同样应新建 D1，并在 Console 分批执行已审查的 SQL（大型导出改用 CLI），验证后切换 `DB` binding。回滚 Worker 版本不会恢复 D1。

## 4. Ubuntu/Debian：Node + SQLite

### 4.1 安装与专用账户

安装 Node.js 22+（使用可信发行源并验证 `node --version`），然后：

```bash
sudo apt-get update
sudo apt-get install -y git sqlite3
sudo useradd --system --home /var/lib/<SERVICE_NAME> --shell /usr/sbin/nologin <SERVICE_USER>
sudo install -d -o <SERVICE_USER> -g <SERVICE_GROUP> -m 0750 /opt/<APP_DIRECTORY>
sudo install -d -o <SERVICE_USER> -g <SERVICE_GROUP> -m 0750 /var/lib/<SERVICE_NAME>
sudo install -d -o root -g root -m 0700 <SAFE_BACKUP_PATH>
```

以发布流程把代码放入 `/opt/<APP_DIRECTORY>`（不要复制 `.git`、测试数据库或秘密）：

```bash
cd /opt/<APP_DIRECTORY>
sudo -u <SERVICE_USER> npm ci
sudo -u <SERVICE_USER> npm test
sudo -u <SERVICE_USER> npm run build
sudo chown -R root:<SERVICE_GROUP> /opt/<APP_DIRECTORY>
sudo chmod -R go-w /opt/<APP_DIRECTORY>
sudo chown <SERVICE_USER>:<SERVICE_GROUP> /var/lib/<SERVICE_NAME>
```

SQLite 文件及其目录必须可由服务用户写入（WAL/SHM 也在目录中），应用代码不应可写。`DB_PATH=/var/lib/<SERVICE_NAME>/<DATABASE_FILE>.sqlite`。

### 4.2 systemd

创建 `/etc/systemd/system/<SERVICE_NAME>.service`：

```ini
[Unit]
Description=<SERVICE_DESCRIPTION>
After=network.target
[Service]
Type=simple
User=<SERVICE_USER>
Group=<SERVICE_GROUP>
WorkingDirectory=/opt/<APP_DIRECTORY>
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=<LOCAL_PORT>
Environment=DB_PATH=/var/lib/<SERVICE_NAME>/<DATABASE_FILE>.sqlite
ExecStart=/usr/bin/node apps/server/server.mjs
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/<SERVICE_NAME>
[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now <SERVICE_NAME>
sudo systemctl status <SERVICE_NAME>
curl -fsS http://127.0.0.1:<LOCAL_PORT>/api/health
```

### 4.3 Caddy 或 Nginx + HTTPS

Caddy 示例：

```caddyfile
<APP_DOMAIN> {
  reverse_proxy 127.0.0.1:<LOCAL_PORT>
}
```

Nginx 示例：

```nginx
server {
  listen 80;
  server_name <APP_DOMAIN>;
  location / { proxy_pass http://127.0.0.1:<LOCAL_PORT>; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
}
```

Caddy 可自动申请证书；Nginx 可搭配发行版 Certbot。只向公网开放 80/443，Node 仅监听 `127.0.0.1`。证书生效后验证 HTTPS；生产不要设置 `COOKIE_SECURE=false`。

### 4.4 升级、备份、恢复、回滚

```bash
export DB_PATH=/var/lib/<SERVICE_NAME>/<DATABASE_FILE>.sqlite
sudo -u <SERVICE_USER> sqlite3 "$DB_PATH" ".backup '<SAFE_BACKUP_PATH>/<BACKUP_FILE>.sqlite'"
# 发布新代码到一个版本目录，npm ci、完整测试、build 后原子切换 current symlink
sudo systemctl restart <SERVICE_NAME>
sudo journalctl -u <SERVICE_NAME> -n 100 --no-pager
curl -fsS https://<APP_DOMAIN>/api/health
```

确认备份可打开：`sqlite3 <SAFE_BACKUP_PATH>/<BACKUP_FILE>.sqlite 'PRAGMA integrity_check;'`，并安全复制到异地。恢复：

```bash
sudo systemctl stop <SERVICE_NAME>
sudo cp "$DB_PATH" <SAFE_BACKUP_PATH>/<FAILED_STATE_FILE>.sqlite
sudo cp <SAFE_BACKUP_PATH>/<BACKUP_FILE>.sqlite "$DB_PATH"
sudo chown <SERVICE_USER>:<SERVICE_GROUP> "$DB_PATH"
sudo chmod 0600 "$DB_PATH"
sudo systemctl start <SERVICE_NAME>
```

应用回滚应把版本软链接切回 `<KNOWN_GOOD_RELEASE>` 后重启。只有 schema/data 确实不兼容时才停机恢复 SQLite；先保留故障现场并检查备份完整性。

## 5. 双版本迁移

两版**不会自动同步**账户或条目，也不是主从数据库。不要用 D1 SQL 导出直接灌入 SQLite（反之亦然）。在源站 UI 导出加密备份，在目标站单独注册/登录并解锁，再导入。备份仍是敏感资产：加密传输、限制权限、离线保存；核对条目数和抽样解密成功后再删除源数据。主密码不会随账户自动迁移。

## 6. 故障排查

| 症状 | 检查 |
|---|---|
| Worker 报 `DB` 未定义 | binding 名必须为 `DB`，环境/版本指向正确 D1 |
| `no such table` | migration 是否对 **remote** 目标执行；Dashboard Console 是否执行完整 SQL |
| 静态页面 404/旧版本 | 先 `npm run build`；核对 Assets=`dist/`、缓存和部署版本 |
| Dashboard 只能发布静态站 | 改用 Worker+Assets 的 Wrangler/CI 工作流，不要用纯 Pages 替代 API |
| 登录后立刻退出 | HTTPS、Secure Cookie、系统时钟、代理 `Host`/`X-Forwarded-Proto` |
| 403/CSRF | 同源访问、Cookie 是否发送、反代是否保留主机/协议 |
| SQLite `readonly`/`SQLITE_CANTOPEN` | 检查 `DB_PATH`、父目录所有权/写权限、systemd `ReadWritePaths` |
| systemd 启动失败 | `journalctl -u <SERVICE_NAME>`、Node 版本、WorkingDirectory、端口占用 |
| 502 | Node 是否监听回环端口；反代 upstream 与防火墙配置 |
| 导入失败 | 目标已解锁、备份未损坏且格式兼容；保留源数据后重试 |
| 回滚后异常 | 代码与 schema 是否兼容；代码回滚不等于数据库回滚 |

查看日志时先脱敏；不要记录或粘贴密码、vault key、条目正文、完整密文、Cookie 或 token。
