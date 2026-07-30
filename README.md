# mcp-server-web-fetcher

[![CI](https://github.com/vojtisprime11/mcp-server-web-fetcher/actions/workflows/ci.yml/badge.svg)](https://github.com/vojtisprime11/mcp-server-web-fetcher/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/mcp-server-web-fetcher.svg)](https://www.npmjs.com/package/mcp-server-web-fetcher)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](tsconfig.json)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.18.1-5fa04e.svg)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-1.30-6b4fbb.svg)](https://modelcontextprotocol.io)

A fast, dependency-light [Model Context Protocol](https://modelcontextprotocol.io) server that turns
any web page into something a language model can actually read: clean Markdown, structured metadata,
and a classified list of links.

Web pages are 90% chrome. Scripts, cookie banners, navigation, sidebars and tracking pixels burn
context and derail reasoning. This server strips all of that on the way in, so the model sees the
article and nothing else.

```
┌────────────┐   stdio/JSON-RPC   ┌──────────────────────┐   HTTPS   ┌──────────┐
│ MCP client │ ─────────────────► │ mcp-server-web-      │ ────────► │ web page │
│ (Claude,   │ ◄───────────────── │ fetcher              │ ◄──────── │          │
│  Kiro, …)  │  Markdown + JSON   │ fetch → clean → md   │           └──────────┘
└────────────┘                    └──────────────────────┘
```

## Features

- **Clean Markdown output.** Readability-style main-content detection, GFM tables, language-tagged
  code fences, absolute links. No leftover HTML, even for gnarly nested tables.
- **Context-window aware.** Long pages are paginated with `startIndex` / `nextStartIndex` instead of
  being silently cut in half.
- **Structured metadata.** Title, description, canonical, `lang`, author, publish/modify dates,
  Open Graph, Twitter cards, JSON-LD, `hreflang` alternates, RSS/Atom feeds, h1–h6 outline and raw
  HTTP headers.
- **Link intelligence.** Absolute URLs, anchor text, `rel`, `nofollow`, internal vs external
  classification, scope filters, de-duplication.
- **SSRF hardening.** Loopback, private, link-local and cloud-metadata addresses are blocked on
  _every_ redirect hop, not just the first request. Credentials in URLs are stripped.
- **Predictable failures.** Every error carries a stable machine-readable `code`
  (`TIMEOUT`, `HTTP_ERROR`, `BLOCKED_HOST`, `RESPONSE_TOO_LARGE`, …), a retryability flag and a
  recovery hint, so the model can self-correct instead of guessing.
- **Typed end to end.** Strict Zod input schemas plus published `outputSchema`, so clients get
  validated `structuredContent`, not prose they have to re-parse.
- **Well behaved.** Byte caps, timeouts, redirect limits, charset sniffing (including legacy
  encodings), a small TTL cache, transient-failure retries and optional `robots.txt` enforcement.
- **115 tests, no network required.** Vitest unit tests plus in-memory MCP protocol tests.

## Quickstart

Requires Node.js 20.18.1 or newer (inherited from cheerio, which needs undici 7).

```bash
# run it without installing
npx -y mcp-server-web-fetcher

# or install globally
npm install -g mcp-server-web-fetcher
mcp-server-web-fetcher
```

The server speaks MCP over stdio, so on its own it just waits for a client. Point a client at it:

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS,
`%APPDATA%\Claude\claude_desktop_config.json` on Windows:

```json
{
  "mcpServers": {
    "web-fetcher": {
      "command": "npx",
      "args": ["-y", "mcp-server-web-fetcher"]
    }
  }
}
```

With configuration, using a global install:

```json
{
  "mcpServers": {
    "web-fetcher": {
      "command": "mcp-server-web-fetcher",
      "env": {
        "WEB_FETCHER_TIMEOUT_MS": "20000",
        "WEB_FETCHER_RESPECT_ROBOTS": "true"
      }
    }
  }
}
```

Restart Claude Desktop, then ask it to summarise a URL.

### Claude Code

```bash
claude mcp add web-fetcher -- npx -y mcp-server-web-fetcher
```

### Kiro, Cursor, Windsurf and other MCP clients

Same shape, in `.kiro/settings/mcp.json` / the client's MCP config file:

```json
{
  "mcpServers": {
    "web-fetcher": {
      "command": "npx",
      "args": ["-y", "mcp-server-web-fetcher"],
      "disabled": false,
      "autoApprove": ["fetch_page_markdown", "extract_metadata", "extract_links"]
    }
  }
}
```

### MCP Registry

The server is published to the [official MCP Registry](https://modelcontextprotocol.io/registry)
as `io.github.vojtisprime11/web-fetcher`, so clients that read the registry can discover it
directly:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.vojtisprime11/web-fetcher"
```

### From source

```bash
git clone https://github.com/vojtisprime11/mcp-server-web-fetcher.git
cd mcp-server-web-fetcher
npm install
npm run build
node dist/index.js          # or: npm run inspect
```

```json
{
  "mcpServers": {
    "web-fetcher": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-web-fetcher/dist/index.js"]
    }
  }
}
```

## Tools

All three tools are read-only, idempotent and open-world (annotated as such in the protocol), and
all take an absolute `http(s)` URL.

### `fetch_page_markdown`

Downloads a page and returns clean, LLM-friendly Markdown.

| Parameter         | Type                | Default       | Description                                                    |
| ----------------- | ------------------- | ------------- | -------------------------------------------------------------- |
| `url`             | string              | required      | Absolute http(s) URL.                                          |
| `maxLength`       | integer 500–1000000 | `25000`       | Markdown characters to return per call.                        |
| `startIndex`      | integer ≥ 0         | `0`           | Character offset; use `nextStartIndex` from the previous call. |
| `mainContentOnly` | boolean             | `true`        | Drop nav/header/footer/sidebar, keep the densest block.        |
| `includeLinks`    | boolean             | `true`        | Keep Markdown links (`false` inlines the text only).           |
| `includeImages`   | boolean             | `false`       | Keep images as `![alt](src)`.                                  |
| `includeMetadata` | boolean             | `true`        | Attach a short metadata summary.                               |
| `timeoutMs`       | integer 1000–120000 | env / `15000` | Per-request timeout.                                           |

Request:

```json
{
  "name": "fetch_page_markdown",
  "arguments": {
    "url": "https://example.com/blog/caching",
    "maxLength": 8000,
    "mainContentOnly": true,
    "includeImages": false
  }
}
```

`structuredContent`:

```json
{
  "url": "https://example.com/blog/caching",
  "requestedUrl": "https://example.com/blog/caching",
  "status": 200,
  "contentType": "text/html; charset=utf-8",
  "title": "How caching works",
  "markdown": "# How caching works\n\nCaching is the art of **not** doing work twice...",
  "markdownLength": 7984,
  "totalLength": 21874,
  "startIndex": 0,
  "endIndex": 7984,
  "nextStartIndex": 7984,
  "truncated": true,
  "wordCount": 1203,
  "bytesDownloaded": 148213,
  "elapsedMs": 412,
  "fromCache": false,
  "redirects": [],
  "metadata": {
    "title": "How caching works",
    "description": "A deep dive into HTTP caching.",
    "canonical": "https://example.com/blog/caching",
    "language": "en",
    "author": "Ada Lovelace",
    "publishedTime": "2026-01-15T09:00:00Z"
  }
}
```

To read the rest, call again with `"startIndex": 7984`. Keep going while `nextStartIndex` is not
`null`.

### `extract_metadata`

Everything a model needs to classify a page, without spending context on its body.

| Parameter            | Type                | Default       | Description                                                 |
| -------------------- | ------------------- | ------------- | ----------------------------------------------------------- |
| `url`                | string              | required      | Absolute http(s) URL.                                       |
| `includeJsonLd`      | boolean             | `true`        | Include parsed JSON-LD blocks (malformed ones are skipped). |
| `includeHeadings`    | boolean             | `true`        | Include the h1–h6 outline.                                  |
| `includeHttpHeaders` | boolean             | `true`        | Include response headers, lower-cased.                      |
| `timeoutMs`          | integer 1000–120000 | env / `15000` | Per-request timeout.                                        |

```json
{
  "name": "extract_metadata",
  "arguments": { "url": "https://example.com/blog/caching", "includeJsonLd": true }
}
```

`structuredContent` (abridged):

```json
{
  "url": "https://example.com/blog/caching",
  "status": 200,
  "charset": "utf-8",
  "title": "How caching works",
  "description": "A deep dive into HTTP caching.",
  "canonical": "https://example.com/blog/caching",
  "language": "en",
  "author": "Ada Lovelace",
  "publishedTime": "2026-01-15T09:00:00Z",
  "modifiedTime": null,
  "robots": "index, follow",
  "favicon": "https://example.com/favicon.ico",
  "openGraph": {
    "title": "How caching works",
    "type": "article",
    "image": "https://example.com/img/cover.png"
  },
  "twitter": { "card": "summary_large_image", "site": "@example" },
  "alternates": [{ "hreflang": "de", "href": "https://example.com/de/blog/caching" }],
  "feeds": [
    { "title": "Feed", "href": "https://example.com/feed.xml", "type": "application/rss+xml" }
  ],
  "jsonLd": [{ "@type": "Article", "headline": "How caching works" }],
  "headings": [
    { "level": 1, "text": "How caching works", "id": null },
    { "level": 2, "text": "Directives", "id": "directives" }
  ],
  "httpHeaders": { "content-type": "text/html; charset=utf-8", "x-cache": "HIT" },
  "wordCount": 1203,
  "redirects": [],
  "fromCache": false
}
```

### `extract_links`

| Parameter        | Type                              | Default       | Description                        |
| ---------------- | --------------------------------- | ------------- | ---------------------------------- |
| `url`            | string                            | required      | Absolute http(s) URL.              |
| `scope`          | `all` \| `internal` \| `external` | `all`         | Same-site, off-site, or both.      |
| `includeAnchors` | boolean                           | `false`       | Include in-page `#fragment` links. |
| `deduplicate`    | boolean                           | `true`        | Collapse repeated URLs.            |
| `limit`          | integer 1–2000                    | `200`         | Maximum links returned.            |
| `timeoutMs`      | integer 1000–120000               | env / `15000` | Per-request timeout.               |

```json
{
  "name": "extract_links",
  "arguments": { "url": "https://example.com/blog/caching", "scope": "external", "limit": 50 }
}
```

`structuredContent`:

```json
{
  "url": "https://example.com/blog/caching",
  "status": 200,
  "totalFound": 2,
  "returned": 2,
  "internalCount": 0,
  "externalCount": 2,
  "truncated": false,
  "links": [
    {
      "url": "https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching",
      "text": "MDN article",
      "title": null,
      "rel": "noopener nofollow",
      "internal": false,
      "nofollow": true
    }
  ],
  "fromCache": false
}
```

`www.example.com` and `example.com` count as the same site; `blog.example.com` does not.

## Error handling

Failures come back as MCP tool errors (`isError: true`), never as silent empty results:

```
HTTP_ERROR: 404 Client Error for https://example.com/missing
Retryable: no
Hint: Check the URL, or retry later if the status is 429/5xx.
```

`structuredContent.error` carries the same information as JSON: `{ code, message, retryable, url, status }`.

| Code                       | Meaning                                                         |
| -------------------------- | --------------------------------------------------------------- |
| `INVALID_URL`              | Not an absolute URL.                                            |
| `BLOCKED_SCHEME`           | Scheme other than `http`/`https`.                               |
| `BLOCKED_HOST`             | Loopback, private, link-local or metadata address (SSRF guard). |
| `DNS_FAILURE`              | Host does not resolve.                                          |
| `TIMEOUT`                  | Request exceeded `timeoutMs`.                                   |
| `HTTP_ERROR`               | Response status ≥ 400, or a redirect without `Location`.        |
| `TOO_MANY_REDIRECTS`       | Redirect chain longer than the limit.                           |
| `RESPONSE_TOO_LARGE`       | Declared body larger than the byte cap.                         |
| `UNSUPPORTED_CONTENT_TYPE` | Not a text/HTML/XML/JSON document.                              |
| `ROBOTS_DISALLOWED`        | Blocked by `robots.txt` (only when enforcement is on).          |
| `NETWORK_ERROR`            | Connection reset, TLS failure, and similar.                     |
| `PARSE_ERROR`              | Document could not be parsed.                                   |

Timeouts, 5xx, 408 and 429 responses are retried once automatically before the error surfaces.

## Configuration

Everything is optional; the defaults are safe.

| Variable                          | Default                                        | Description                                                |
| --------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `WEB_FETCHER_USER_AGENT`          | `mcp-server-web-fetcher/<version> (+repo url)` | Outgoing `User-Agent`.                                     |
| `WEB_FETCHER_TIMEOUT_MS`          | `15000`                                        | Default timeout (1000–120000).                             |
| `WEB_FETCHER_MAX_BYTES`           | `5000000`                                      | Per-response byte cap (10000–50000000).                    |
| `WEB_FETCHER_MAX_REDIRECTS`       | `5`                                            | Redirect hops allowed (0–20).                              |
| `WEB_FETCHER_ALLOW_PRIVATE_HOSTS` | `false`                                        | Set to `true` only to fetch localhost/LAN URLs on purpose. |
| `WEB_FETCHER_RESPECT_ROBOTS`      | `false`                                        | Enforce `robots.txt` (RFC 9309 subset) before fetching.    |
| `WEB_FETCHER_CACHE_TTL_MS`        | `60000`                                        | Response cache TTL; `0` disables caching.                  |
| `WEB_FETCHER_CACHE_MAX_ENTRIES`   | `50`                                           | Maximum cached responses.                                  |

## Security

- **SSRF guard on by default.** Hostnames are resolved and checked against loopback, RFC 1918,
  CGNAT, link-local (including `169.254.169.254`), multicast and IPv4-mapped IPv6 ranges — for the
  initial URL _and_ every redirect target. `localhost`, `*.localhost` and `*.internal` are refused
  outright. Turning the guard off is an explicit opt-in.
- **Byte and time caps.** Responses are streamed and cut at the byte cap; every request is aborted
  at the timeout. Content-Length larger than the cap is rejected before download.
- **No code execution.** JavaScript is never run; `<script>`, `<style>`, `<iframe>` and friends are
  removed before conversion. Fetched content is data, not instructions — treat page text reaching a
  model as untrusted input.
- **Credentials stripped.** `user:pass@` is removed from URLs before the request is made.
- **Read-only.** The server has no write, filesystem or shell surface, and no authentication state.

Found a vulnerability? See [SECURITY.md](SECURITY.md).

## Architecture

```
src/
├── index.ts              # stdio entry point (logs to stderr only)
├── server.ts             # transport-agnostic server factory + public API
├── types.ts              # Zod input/output schemas for every tool
├── tools/
│   ├── fetchPageMarkdown.ts
│   ├── extractMetadata.ts
│   ├── extractLinks.ts
│   ├── shared.ts         # result shaping, dependency injection
│   └── index.ts
└── lib/
    ├── config.ts         # env-driven configuration
    ├── errors.ts         # typed error codes + recovery hints
    ├── net.ts            # URL parsing, SSRF guard, link resolution
    ├── http.ts           # fetch pipeline: timeouts, caps, redirects, charset, cache
    ├── robots.ts         # optional robots.txt support
    ├── html.ts           # cheerio cleanup, metadata + link extraction
    ├── markdown.ts       # turndown configuration, tables, pagination
    └── cache.ts          # TTL + LRU cache
tests/                    # unit tests + in-memory MCP protocol tests
```

Tool handlers take an injectable `fetchImpl`, so every test runs offline against a scripted HTTP
stub. The library is also importable directly:

```ts
import { runFetchPageMarkdown } from 'mcp-server-web-fetcher';

const page = await runFetchPageMarkdown({ url: 'https://example.com' });
console.log(page.markdown);
```

## Development

The minimum supported Node.js version is 20.18.1, which comes from cheerio (it depends on undici 7,
and undici 7 needs the `File` global that landed in Node 20). CI runs the suite on Node 20/22/24 and
has a separate job that completes an MCP handshake against the built server on exactly 20.18.1, so
the declared floor is verified rather than assumed.

```bash
npm install
npm run dev            # tsx watch
npm run typecheck
npm run lint
npm test               # vitest run
npm run test:coverage  # thresholds enforced
npm run build
npm run inspect        # MCP Inspector against dist/index.js
node scripts/smoke.mjs https://example.com   # live end-to-end check
```

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Limitations

- Static HTML only. Client-rendered SPAs return whatever the server sends; no headless browser.
- No PDF or Office document extraction.
- Sites behind bot protection (Cloudflare challenges, login walls) will return 403.
- Main-content detection is a text-density heuristic. Use `mainContentOnly: false` when a page has
  an unusual structure.

## Roadmap

- `search_page` tool: return only the sections matching a query.
- Optional headless rendering behind a flag, for JS-only pages.
- Streamable HTTP transport in addition to stdio.
- Conditional requests (`ETag` / `If-Modified-Since`) in the cache layer.

## Acknowledgements

Built on the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk),
[cheerio](https://cheerio.js.org/), [turndown](https://github.com/mixmark-io/turndown) and
[zod](https://zod.dev/).

## License

[MIT](LICENSE) © Vojta Holes and contributors
