# Contributing / 贡献指南

感谢贡献。安全与密文契约变更需要格外谨慎。/ Thank you for contributing. Security and encrypted-contract changes require extra care.

## 开始 / Getting started

```bash
git clone <REPOSITORY_URL>
cd <REPOSITORY_DIRECTORY>
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

Node.js 22+ is required. Create a focused branch, keep changes small, and add tests for behavior changes.

## Rules / 规则

- 服务端不得接触或记录主密码、vault key、条目明文或敏感请求正文。
- Validate input, authorization/ownership, CSRF, and origin assumptions at trust boundaries.
- Contract changes must update both backends, tests, and `docs/API.md`.
- UI changes must remain keyboard accessible and usable at narrow mobile widths.
- Never commit real domains, IDs, tokens, production data, databases, exports, or sensitive screenshots.
- Do not deploy from a contribution branch or include generated production state.
- Keep Chinese and English user-facing documentation aligned.

## Pull requests

Describe the problem, approach, security impact, test evidence, and documentation changes. Link the issue when applicable. Before requesting review, run the complete gate:

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Security vulnerabilities must follow [`SECURITY.md`](SECURITY.md), not a public pull request. By contributing, you agree that your contribution is distributed under the repository's license once a root `LICENSE` has been established.
