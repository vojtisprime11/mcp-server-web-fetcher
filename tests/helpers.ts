/** Shared test fixtures and a scriptable `fetch` stub. No test touches the network. */

import { loadConfig, type ServerConfig } from '../src/lib/config.js';

/** Config with the SSRF guard and cache disabled so tests stay hermetic. */
export function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    ...loadConfig({}),
    blockPrivateHosts: false,
    respectRobots: false,
    cacheTtlMs: 0,
    cacheMaxEntries: 0,
    ...overrides,
  };
}

export interface StubResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

export interface FetchStub {
  fetchImpl: typeof globalThis.fetch;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
}

/** Builds a `fetch` implementation from a URL → response map or a single response. */
export function stubFetch(routes: Record<string, StubResponse> | StubResponse): FetchStub {
  const calls: FetchStub['calls'] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });

    const route = isRouteMap(routes) ? routes[url] : routes;
    if (!route) {
      return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
    }

    const headers = { 'content-type': 'text/html; charset=utf-8', ...route.headers };
    const status = route.status ?? 200;
    const hasBody = status !== 204 && status !== 304 && !(status >= 300 && status < 400);
    // Uint8Array bodies are valid at runtime; the DOM lib types are narrower.
    const body = (hasBody ? (route.body ?? '') : null) as BodyInit | null;
    return new Response(body, { status, headers });
  }) as typeof globalThis.fetch;

  return { fetchImpl, calls };
}

function isRouteMap(
  value: Record<string, StubResponse> | StubResponse,
): value is Record<string, StubResponse> {
  return !('status' in value || 'headers' in value || 'body' in value);
}

export const ARTICLE_URL = 'https://example.com/blog/post';

/** A page with the usual real-world noise: nav, ads, cookie banner, footer, tracking. */
export const ARTICLE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>How caching works &mdash; Example Blog</title>
  <meta name="description" content="A deep dive into HTTP caching.">
  <meta name="author" content="Ada Lovelace">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="How caching works">
  <meta property="og:description" content="A deep dive into HTTP caching.">
  <meta property="og:image" content="/img/cover.png">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@example">
  <meta name="article:published_time" content="2026-01-15T09:00:00Z">
  <link rel="canonical" href="https://example.com/blog/post">
  <link rel="icon" href="/favicon.ico">
  <link rel="alternate" hreflang="de" href="/de/blog/post">
  <link rel="alternate" type="application/rss+xml" title="Feed" href="/feed.xml">
  <script type="application/ld+json">{"@type":"Article","headline":"How caching works"}</script>
  <script type="application/ld+json">{ this is not json }</script>
  <script>window.analytics = true;</script>
  <style>body { color: red }</style>
</head>
<body>
  <header>
    <nav>
      <a href="/">Home</a>
      <a href="/blog">Blog</a>
      <a href="/pricing">Pricing</a>
    </nav>
  </header>
  <div class="cookie-banner"><p>We use cookies.</p><button>Accept</button></div>
  <main>
    <article>
      <h1>How caching works</h1>
      <p>Caching is the art of <strong>not</strong> doing work twice. See the
      <a href="/docs/cache-control">Cache-Control guide</a> or the
      <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching" rel="noopener nofollow">MDN article</a>.</p>
      <h2>Directives</h2>
      <table>
        <thead><tr><th>Directive</th><th>Meaning</th></tr></thead>
        <tbody><tr><td>max-age</td><td>Freshness lifetime</td></tr></tbody>
      </table>
      <pre><code class="language-http">Cache-Control: max-age=600
</code></pre>
      <ul><li>Fresh</li><li>Stale</li></ul>
      <img src="/img/diagram.png" alt="Cache diagram">
      <p><a href="#directives">Jump to directives</a></p>
      <p><a href="javascript:void(0)">Broken link</a></p>
    </article>
  </main>
  <aside class="sidebar"><a href="/newsletter">Subscribe</a></aside>
  <footer><a href="https://twitter.com/example">Twitter</a><a href="/blog">Blog</a></footer>
  <noscript>Enable JavaScript</noscript>
</body>
</html>`;
