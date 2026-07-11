# Cloudflare Deployment Guide (Workers + Static Assets + D1)

[中文](cloudflare-deployment.zh-CN.md) · [English](cloudflare-deployment.en.md) · [Back to home](../README.en.md)

This guide is exclusively for Cloudflare deployment. Replace every `<...>` placeholder. Never commit real account IDs, D1 IDs, tokens, or domains.

## Requirements and architecture

- Node.js 22+, npm, Git, and a Cloudflare account with Workers and D1.
- Wrangler authentication for CLI deployment; a connected GitHub repository or equivalent build/upload path for Dashboard deployment.

```text
Browser ──HTTPS──> Cloudflare Worker
                       ├─ /api/* → Worker → D1 binding: DB
                       └─ other  → Workers Static Assets (dist/)
```

Before the first operation, run at repository root:

```bash
npm ci
npm test && npm run lint && npm run typecheck && npm run build
```

## 1. Wrangler CLI deployment

### 1.1 Authenticate, create D1, and configure

```bash
npx wrangler login
npx wrangler whoami
cd apps/worker
npx wrangler d1 create <D1_DATABASE_NAME>
```

Copy the returned `database_id`. Edit `apps/worker/wrangler.jsonc`:

- set `name` to `<WORKER_NAME>`;
- keep binding `DB` and set the real `database_name`/`database_id`;
- keep `migrations_dir` as `migrations`;
- keep Assets at `../../dist` with `run_worker_first: true`;
- remove sample routes or replace them with your domain. Keep placeholders on a public branch and inject real values through an uncommitted config or CI secrets.

### 1.2 Migrate, build, and deploy

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

Add a new migration for every schema change. Never rewrite a migration already applied remotely.

### 1.3 Custom domain

Add this to the config (confirm fields against the current Wrangler schema):

```json
"routes": [{ "pattern": "<APP_DOMAIN>", "custom_domain": true }]
```

Deploy again, or use Worker **Settings → Domains & Routes → Add → Custom Domain** in Dashboard. After DNS and certificate issuance, verify the homepage and `/api/health`.

## 2. Cloudflare Dashboard deployment

Dashboard labels may change; follow the current UI.

1. **Storage & Databases → D1 → Create database** and create `<D1_DATABASE_NAME>`.
2. **Workers & Pages → Create → Import a repository**; connect `<GITHUB_REPOSITORY>` and select `<PRODUCTION_BRANCH>`.
3. Set Root directory to repository root and Build command to `npm ci && npm run build`.
4. This is not static-only Pages: it needs a Worker API plus Workers Static Assets. Where supported, set deploy command to `npx wrangler deploy --config apps/worker/wrangler.jsonc`. If import cannot honor the Worker main module, Assets, and D1, invoke Wrangler from Cloudflare CI/GitHub Actions instead of publishing plain Pages.
5. Worker **Settings → Bindings → Add → D1 database**: variable name must be `DB`; select the target database.
6. Prefer Wrangler migrations from a controlled terminal. If D1 **Console** is required, execute unapplied SQL under `apps/worker/migrations/` in order and inspect tables afterward; do not repeat non-idempotent migrations.
7. Confirm Assets use built `dist/` and API requests reach the Worker first.
8. Add `<APP_DOMAIN>` under **Settings → Domains & Routes**, then finish DNS/certificate setup.
9. Store least-privilege `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as encrypted CI secrets, never repository values or log output.

## 3. Post-deployment verification

```bash
curl -fsS https://<APP_DOMAIN>/api/health
curl -fsSI https://<APP_DOMAIN>/
```

Using a disposable account, test registration, sign-in/unlock, CSRF rejection, encrypted-item CRUD, encrypted backup import/export, and logout. Do not use real secrets or broad user-deletion queries.

## 4. Upgrade, backup, restore, and rollback

Export D1 before an upgrade and confirm the file is non-empty:

```bash
cd apps/worker
npx wrangler d1 export <D1_DATABASE_NAME> --remote --output=<SAFE_BACKUP_PATH>/d1-<TIMESTAMP>.sql
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote
cd ../..
npm ci && npm test && npm run lint && npm run typecheck && npm run build
npx wrangler d1 migrations apply <D1_DATABASE_NAME> --remote --config apps/worker/wrangler.jsonc
npx wrangler deploy --config apps/worker/wrangler.jsonc
```

Restrict and store the export off-site. Prefer restoring into a new D1, validating it, and switching binding `DB` instead of overwriting an active database:

```bash
npx wrangler d1 create <RESTORE_DATABASE_NAME>
npx wrangler d1 execute <RESTORE_DATABASE_NAME> --remote --file=<SAFE_BACKUP_PATH>/<BACKUP_FILE>.sql
```

Code rollback:

```bash
npx wrangler versions list --config apps/worker/wrangler.jsonc
npx wrangler rollback <KNOWN_GOOD_VERSION_ID> --config apps/worker/wrangler.jsonc
```

**Worker rollback does not roll back D1.** For an incompatible migration, stop writes and switch to a validated restored database, or use a reviewed forward-fix migration. Dashboard restoration should also use a new D1, reviewed SQL in Console (CLI for large exports), validation, and then a binding switch.

## 5. Security and troubleshooting

- Enable MFA on Cloudflare, use and rotate least-privilege API tokens, and secure GitHub/CI.
- Use production only over HTTPS. Encrypt, restrict, store off-site, and rehearse backups.
- Never log or share passwords, vault keys, plaintext, full ciphertext, cookies, or tokens.

| Symptom | Check |
|---|---|
| `DB` is undefined | Binding is exactly `DB`; current environment/version uses the intended D1 |
| `no such table` | Migrations ran completely against the `--remote` target |
| Static 404/stale UI | `npm run build`, Assets=`dist/`, deployment version, cache |
| Dashboard creates only a static site | Use Worker + Assets through Wrangler/CI, not plain Pages as an API replacement |
| Session disappears | HTTPS, system clock, consistent cookie/domain |
| 403/CSRF | Same-origin access, cookie delivery, consistent custom domain |
| Failure after rollback | Code/D1 schema compatibility; version rollback is not database rollback |
