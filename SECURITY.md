# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |

Until 1.0, security fixes land on the latest minor release.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

1. Use [GitHub private vulnerability reporting](https://github.com/vojtisprime11/mcp-server-web-fetcher/security/advisories/new), or
2. email `holesvojta003@gmail.com` with `SECURITY` in the subject.

Include the affected version, reproduction steps, the impact you see and any suggested fix.

Expected timeline:

- acknowledgement within 48 hours,
- initial assessment within 7 days,
- fix and coordinated disclosure as soon as a patch is validated.

Reporters are credited in the advisory unless they prefer to stay anonymous.

## Threat model

This server fetches URLs chosen by a language model and runs inside the user's trust boundary. The
two risks that matter most:

### 1. Server-side request forgery (SSRF)

An attacker who can influence the model's tool call could try to reach internal services
(`http://localhost:8080/admin`, `http://169.254.169.254/latest/meta-data/`, LAN devices).

Mitigations, on by default:

- only `http`/`https` schemes are accepted; credentials in URLs are stripped,
- hostnames are resolved and rejected when they point at loopback, RFC 1918, CGNAT, link-local,
  multicast or IPv4-mapped-IPv6 non-public ranges,
- `localhost`, `*.localhost` and `*.internal` are refused without a DNS lookup,
- the check runs on **every redirect hop**, so a public URL cannot redirect into private space,
- redirects are followed manually with a hop limit.

Setting `WEB_FETCHER_ALLOW_PRIVATE_HOSTS=true` disables the guard. Only do that when fetching your
own local services on purpose.

### 2. Prompt injection through fetched content

Page content is untrusted data. A page can contain text designed to look like instructions to the
model. This server does not execute or interpret page content, but downstream clients should treat
Markdown returned by these tools as data, never as instructions.

## Resource limits

- Responses are streamed and cut at `WEB_FETCHER_MAX_BYTES` (default 5 MB); a larger declared
  `Content-Length` is rejected before download.
- Every request is aborted at `timeoutMs` (default 15 s, hard maximum 120 s).
- Non-text content types are rejected instead of being buffered.
- The response cache is bounded in both entry count and TTL.

## Out of scope

- No JavaScript is executed, so DOM-based XSS in fetched pages cannot affect this server.
- The server exposes no authentication, storage, filesystem or shell surface.
- Rate limiting toward third-party sites is the operator's responsibility; be a good citizen and
  consider enabling `WEB_FETCHER_RESPECT_ROBOTS=true`.
