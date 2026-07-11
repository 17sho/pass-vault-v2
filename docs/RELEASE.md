# Release packages

Two source distributions are produced by `npm run package:release`:

- `pass-vault-v2-cloudflare-1.0.0`: shared browser frontend, Worker backend, and D1 migrations.
- `pass-vault-v2-linux-1.0.0`: production Linux server package with the shared browser frontend, Node backend, and a SQLite database stored on the server.

Each archive is intentionally free of dependencies, runtime data, deployment records, secrets, and production routing/resource configuration. Run `npm ci`, then `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` after extraction. Cloudflare operators must replace the all-zero local D1 database ID and add their own deployment routing only when deploying. Linux operators must provide a writable `DB_PATH`; production should terminate HTTPS in front of the Node service.

`SHA256SUMS` in the release directory authenticates all archives.
