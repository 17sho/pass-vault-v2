# Deployment Guide

[中文](deployment.zh-CN.md) · [English](deployment.en.md) · [Back to home](../README.en.md)

This guide uses placeholders only. Replace `<...>` before execution. Never commit real domains, D1/account IDs, tokens, databases, or backups.

## 1. Prerequisites and layout

- Git, Node.js **22+**, npm; Cloudflare deployment also requires a Workers/D1-enabled account and Wrangler authentication.
- Linux deployment: Ubuntu/Debian, root/sudo, `sqlite3`, and Caddy or Nginx.
- DNS control, production HTTPS, and an independent off-site/offline backup location.

```text
public/                 shared frontend
shared/                 shared encrypted contract
apps/worker/src/        Worker API
apps/worker/migrations/ D1 migrations
apps/worker/wrangler.jsonc
apps/server/            Node + SQLite API
dist/                   static output from npm run build
deploy/                 systemd example
```

Before the first deployment, from the repository root:

```bash
npm ci
npm test && npm run lint && npm run typecheck && npm run build
```

## 2. Cloudflare CLI: Workers + Assets + D1

### 2.1 Create and bind D1

```bash
npx wrangler login
npx wrangler whoami
cd apps/worker
npx wrangler d1 create <D1_DATABASE_NAME>
```

Copy the returned `database_id`. In `apps/worker/wrangler.jsonc`, replace `database_name` and `database_id` with `<D1_DATABASE_NAME>` and `<D1_DATABASE_ID>`, retain binding `DB` and `migrations_dir: "migrations"`, and set `name` to `<WORKER_NAME>`. Remove sample routes or replace them with `<APP_DOMAIN>`. A public repository should retain placeholders; generate an uncommitted deployment config or use CI variables for real values.

### 2.2 Migrate, build, and deploy

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

`assets.directory` targets `../../dist`; `run_worker_first` sends API traffic through the Worker first. Add a new migration for every schema change—never rewrite an applied migration.

### 2.3 Custom domain

Add this to `wrangler.jsonc`:

```json
"routes": [{ "pattern": "<APP_DOMAIN>", "custom_domain": true }]
```

Run `npx wrangler deploy` again, or open Worker **Settings → Domains & Routes → Add → Custom Domain** in Dashboard. After certificate issuance, verify HTTPS and `/api/health`.

### 2.4 Upgrade, backup, restore, and rollback

Before upgrading:

```bash
cd apps/worker
npx wrangler d1 export <D1_DATABASE_NAME> --remote --output=<SAFE_BACKUP_PATH>/d1-<TIMESTAMP>.sql
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote
cd ../.. && npm ci && npm test && npm run lint && npm run typecheck && npm run build
cd apps/worker && npx wrangler d1 migrations apply <D1_DATABASE_NAME> --remote && npx wrangler deploy
```

Confirm the export is non-empty, restrict permissions, and keep an offline copy. Prefer restoring into a new D1 and validating it instead of overwriting an actively written database:

```bash
npx wrangler d1 create <RESTORE_DATABASE_NAME>
npx wrangler d1 execute <RESTORE_DATABASE_NAME> --remote --file=<SAFE_BACKUP_PATH>/<BACKUP_FILE>.sql
```

Switch the binding to the new ID, deploy, and verify. Roll back code with:

```bash
npx wrangler versions list
npx wrangler rollback <KNOWN_GOOD_VERSION_ID>
```

**Worker rollback does not roll back D1.** For incompatible migrations, stop writes and switch to a validated restored database, or apply a reviewed forward-fix migration.

## 3. Cloudflare Dashboard deployment

### 3.1 GitHub and build settings

1. Open **Workers & Pages → Create → Import a repository**, connect `<GITHUB_REPOSITORY>`, and select `<PRODUCTION_BRANCH>`.
2. Set the root directory to the repository root and Build command to `npm ci && npm run build`.
3. This is not a static-only Pages app: the API needs a Worker and static files use Workers Static Assets. Dashboard UI changes over time. If import cannot honor `apps/worker/wrangler.jsonc` or configure the Worker main module, Assets, and D1, **do not publish it as plain Pages**.
4. Viable workflow: use Dashboard for Git integration/build and set the deploy command to `npx wrangler deploy --config apps/worker/wrangler.jsonc` where supported. Otherwise run Wrangler from GitHub Actions/Cloudflare CI. A reliable alternative is Dashboard for resource management/observability and CLI for Worker+Assets deployments.
5. Never expose tokens in repository configuration or build logs. Store least-privilege `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as CI secrets.

### 3.2 Create D1 and its binding in Dashboard

1. Open **Storage & Databases → D1 → Create database** and name it `<D1_DATABASE_NAME>`.
2. Worker → **Settings → Bindings → Add → D1 database**. Variable name must be `DB`; select the new database.
3. In the D1 **Console**, execute the contents of `apps/worker/migrations/0001.sql`, then inspect the tables. Do not repeat non-idempotent SQL. Prefer Wrangler migrations for later upgrades so migration state is tracked.
4. Confirm Worker Assets use built `dist/` and API requests reach the Worker first. If Dashboard cannot attach/upload Assets, use the Wrangler/CI workflow above.
5. Add `<APP_DOMAIN>` under **Settings → Domains & Routes**, then complete DNS and certificate setup.
6. Verify the homepage, `https://<APP_DOMAIN>/api/health`, registration/login, CSRF rejection, encrypted-item CRUD, encrypted backup import/export, and logout. Use clearly disposable test accounts; never broadly delete users.

For Dashboard restoration, likewise create a new D1 and execute reviewed SQL in the Console in manageable sections (use CLI for large exports), validate it, then switch the `DB` binding. Rolling back a Worker version does not restore D1.

## 4. Ubuntu/Debian: Node + SQLite

### 4.1 Install and create a dedicated account

Install Node.js 22+ from a trusted source and verify `node --version`, then:

```bash
sudo apt-get update
sudo apt-get install -y git sqlite3
sudo useradd --system --home /var/lib/<SERVICE_NAME> --shell /usr/sbin/nologin <SERVICE_USER>
sudo install -d -o <SERVICE_USER> -g <SERVICE_GROUP> -m 0750 /opt/<APP_DIRECTORY>
sudo install -d -o <SERVICE_USER> -g <SERVICE_GROUP> -m 0750 /var/lib/<SERVICE_NAME>
sudo install -d -o root -g root -m 0700 <SAFE_BACKUP_PATH>
```

Release source into `/opt/<APP_DIRECTORY>` without `.git`, test databases, or secrets:

```bash
cd /opt/<APP_DIRECTORY>
sudo -u <SERVICE_USER> npm ci
sudo -u <SERVICE_USER> npm test
sudo -u <SERVICE_USER> npm run build
sudo chown -R root:<SERVICE_GROUP> /opt/<APP_DIRECTORY>
sudo chmod -R go-w /opt/<APP_DIRECTORY>
sudo chown <SERVICE_USER>:<SERVICE_GROUP> /var/lib/<SERVICE_NAME>
```

The service user must be able to write the SQLite file **and its directory** (WAL/SHM files live there), while application code should be read-only. Use `DB_PATH=/var/lib/<SERVICE_NAME>/<DATABASE_FILE>.sqlite`.

### 4.2 systemd

Create `/etc/systemd/system/<SERVICE_NAME>.service`:

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

### 4.3 Caddy or Nginx with HTTPS

Caddy example:

```caddyfile
<APP_DOMAIN> {
  reverse_proxy 127.0.0.1:<LOCAL_PORT>
}
```

Nginx example:

```nginx
server {
  listen 80;
  server_name <APP_DOMAIN>;
  location / { proxy_pass http://127.0.0.1:<LOCAL_PORT>; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
}
```

Caddy can provision certificates automatically; Nginx can use the distribution's Certbot. Expose only 80/443 publicly and bind Node to `127.0.0.1`. Verify HTTPS after certificate issuance. Never set `COOKIE_SECURE=false` in production.

### 4.4 Upgrade, backup, restore, and rollback

```bash
export DB_PATH=/var/lib/<SERVICE_NAME>/<DATABASE_FILE>.sqlite
sudo -u <SERVICE_USER> sqlite3 "$DB_PATH" ".backup '<SAFE_BACKUP_PATH>/<BACKUP_FILE>.sqlite'"
# Release into a versioned directory; npm ci, run all checks, build, then atomically switch a current symlink
sudo systemctl restart <SERVICE_NAME>
sudo journalctl -u <SERVICE_NAME> -n 100 --no-pager
curl -fsS https://<APP_DOMAIN>/api/health
```

Validate the copy with `sqlite3 <SAFE_BACKUP_PATH>/<BACKUP_FILE>.sqlite 'PRAGMA integrity_check;'` and store an off-site copy. Restore with:

```bash
sudo systemctl stop <SERVICE_NAME>
sudo cp "$DB_PATH" <SAFE_BACKUP_PATH>/<FAILED_STATE_FILE>.sqlite
sudo cp <SAFE_BACKUP_PATH>/<BACKUP_FILE>.sqlite "$DB_PATH"
sudo chown <SERVICE_USER>:<SERVICE_GROUP> "$DB_PATH"
sudo chmod 0600 "$DB_PATH"
sudo systemctl start <SERVICE_NAME>
```

For application rollback, switch the release symlink to `<KNOWN_GOOD_RELEASE>` and restart. Restore SQLite only if schema/data compatibility requires it; stop the service first, preserve the failed state, and verify backup integrity.

## 5. Moving between editions

The editions **do not automatically synchronize** accounts or items and are not database replicas. Do not import a D1 SQL export directly into SQLite or vice versa. Export an encrypted backup in the source UI, independently register/sign in and unlock at the destination, then import. A backup remains sensitive: transfer it securely, restrict access, and keep offline copies. Confirm item counts and sample decryption before deleting source data. The master password is not automatically migrated with an account.

## 6. Troubleshooting

| Symptom | Check |
|---|---|
| Worker says `DB` is undefined | Binding name is exactly `DB`; environment/version points to the intended D1 |
| `no such table` | Migration ran against the **remote** target; Dashboard Console received all SQL |
| Static 404/stale UI | Run `npm run build`; verify Assets=`dist/`, cache, and deployed version |
| Dashboard publishes only a static site | Use Worker+Assets via Wrangler/CI, not plain Pages as an API substitute |
| Login immediately disappears | HTTPS, Secure Cookie, system clock, proxy `Host`/`X-Forwarded-Proto` |
| 403/CSRF | Same-origin access, Cookie delivery, forwarded host/protocol |
| SQLite `readonly`/`SQLITE_CANTOPEN` | `DB_PATH`, parent-directory ownership/write access, systemd `ReadWritePaths` |
| systemd startup failure | `journalctl -u <SERVICE_NAME>`, Node version, WorkingDirectory, port conflicts |
| 502 | Node listens on loopback port; proxy upstream and firewall are correct |
| Import fails | Destination is unlocked, backup is intact/compatible; retain source and retry |
| Failure after rollback | Code/schema compatibility; code rollback is not database rollback |

Redact logs before sharing. Never log or paste passwords, vault keys, item bodies, full ciphertext, cookies, or tokens.
