# Changelog

All notable changes to this project will be documented here. This file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project intends to use [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.4] - 2026-07-11

### Fixed / 修复
- 修复手机端连续切换顶部分类菜单时，旧详情短暂残留、列表卡片透明闪烁及附件筛选器显隐不同步的问题。
- Fixed mobile top-category navigation flicker: stale detail content is removed in the same frame, list cards remain visible during rapid switches, and the attachment filter visibility stays synchronized.

## [1.1.3] - 2026-07-11

### Fixed
- Release R2 storage-byte reservations when an upload fails after quota reservation, including R2 put and D1 metadata insert failures.
- Release the exact new/old storage delta when attachment backup replacement fails, while conservatively retaining attempted Class A operation counts.

## [1.1.2] - 2026-07-11

### Added
- Conservative D1-backed, atomic R2 storage and monthly Class A/B hard limits with explicit Chinese quota feedback.
- Bilingual documentation of account-wide free allowances, alert limitations, and residual billing risks.

## [1.1.1] - 2026-07-11

### Fixed
- Cloudflare R2 uploads now buffer the validated, fixed-length ciphertext body before calling `R2Bucket.put`, avoiding the production runtime failure caused by passing a transformed request stream.
- Cloudflare uploads now require and verify `Content-Length` before writing an attachment object.

## [1.1.0] - 2026-07-11

### Added
- Zero-knowledge note images and a standalone attachment library for Cloudflare R2 and Linux disk storage.
- Encrypted attachment upload, preview/playback, download, rename, delete, filtering, and version 2 backup round-trips.
- Bilingual Chinese/English project home pages.
- Detailed bilingual Cloudflare CLI, Cloudflare Dashboard, and Linux deployment guides.
- Security policy and contribution guide.

### Security
- Public documentation uses placeholders rather than production domains, database IDs, paths, or credentials.

## [0.1.0] - 2026-07-11

### Added
- Shared mobile-first browser frontend with client-side encryption.
- Cloudflare Workers + Static Assets + D1 backend.
- Linux Node.js + SQLite backend.
- Encrypted backup import/export and password re-wrapping flow.
- Authentication, session, CSRF, origin, and rate-limit protections.

[Unreleased]: https://github.com/17sho/pass-vault-v2/compare/v1.1.4...HEAD
[1.1.4]: https://github.com/17sho/pass-vault-v2/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/17sho/pass-vault-v2/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/17sho/pass-vault-v2/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/17sho/pass-vault-v2/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/17sho/pass-vault-v2/compare/v1.0.0...v1.1.0
[0.1.0]: <REPOSITORY_URL>/releases/tag/v0.1.0
