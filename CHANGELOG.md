# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-30

First public release.

### Added

- `fetch_page_markdown` — fetches a page and returns clean Markdown with main-content detection,
  GFM tables, language-tagged code fences, absolute links and `startIndex`/`nextStartIndex`
  pagination for long documents.
- `extract_metadata` — title, description, canonical, language, author, publish/modify dates,
  robots, favicon, Open Graph, Twitter cards, JSON-LD, `hreflang` alternates, RSS/Atom feeds,
  h1–h6 outline, word count and raw HTTP headers.
- `extract_links` — absolute URLs with anchor text, `title`, `rel`, `nofollow` and internal/external
  classification, plus scope filtering, de-duplication and a result limit.
- Strict Zod input schemas and published `outputSchema` for all tools, so clients receive validated
  `structuredContent`.
- Typed error codes (`INVALID_URL`, `BLOCKED_SCHEME`, `BLOCKED_HOST`, `DNS_FAILURE`, `TIMEOUT`,
  `HTTP_ERROR`, `TOO_MANY_REDIRECTS`, `RESPONSE_TOO_LARGE`, `UNSUPPORTED_CONTENT_TYPE`,
  `ROBOTS_DISALLOWED`, `NETWORK_ERROR`, `PARSE_ERROR`) with retryability flags and recovery hints.
- SSRF protection: loopback, private, CGNAT, link-local and cloud-metadata addresses are blocked on
  every redirect hop; URL credentials are stripped.
- HTTP pipeline with per-request timeouts, streamed byte caps, manual redirect handling, charset
  detection (header + `<meta>` sniffing, legacy encodings), automatic retry of transient failures
  and a TTL/LRU response cache.
- Optional `robots.txt` enforcement (RFC 9309 subset: agent groups, `Allow`/`Disallow`, `*`/`$`
  wildcards, longest-match precedence).
- Environment-based configuration for user agent, timeout, byte cap, redirect limit, private-host
  policy, robots enforcement and cache behaviour.
- Test suite: 115 Vitest tests including in-memory MCP protocol tests, all running offline.
- GitHub Actions CI (lint, typecheck, test matrix on Node 20/22/24, a Node 20.18.1 floor check, build,
  package check) and a
  provenance-enabled release workflow.

[Unreleased]: https://github.com/vojtisprime11/mcp-server-web-fetcher/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/vojtisprime11/mcp-server-web-fetcher/releases/tag/v0.1.0
