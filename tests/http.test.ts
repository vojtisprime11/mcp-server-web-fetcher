import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../src/lib/cache.js';
import { loadConfig } from '../src/lib/config.js';
import {
  charsetFromContentType,
  fetchDocument,
  sniffCharset,
  type FetchedDocument,
} from '../src/lib/http.js';
import { stubFetch, testConfig } from './helpers.js';

const URL_A = 'https://example.com/a';

describe('fetchDocument', () => {
  it('decodes the body and reports timing and byte count', async () => {
    const { fetchImpl } = stubFetch({ [URL_A]: { body: '<p>hello</p>' } });
    const document = await fetchDocument(URL_A, { fetchImpl, config: testConfig() });

    expect(document.body).toBe('<p>hello</p>');
    expect(document.status).toBe(200);
    expect(document.bytes).toBe(12);
    expect(document.truncated).toBe(false);
    expect(document.fromCache).toBe(false);
    expect(document.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('follows redirects and records the chain', async () => {
    const { fetchImpl, calls } = stubFetch({
      [URL_A]: { status: 301, headers: { location: '/b' } },
      'https://example.com/b': { status: 302, headers: { location: 'https://example.com/c' } },
      'https://example.com/c': { body: 'done' },
    });

    const document = await fetchDocument(URL_A, { fetchImpl, config: testConfig() });

    expect(document.body).toBe('done');
    expect(document.url).toBe('https://example.com/c');
    expect(document.requestedUrl).toBe(URL_A);
    expect(document.redirects).toEqual([URL_A, 'https://example.com/b']);
    expect(calls).toHaveLength(3);
  });

  it('stops after the configured number of redirects', async () => {
    const { fetchImpl } = stubFetch({
      [URL_A]: { status: 302, headers: { location: URL_A } },
    });

    await expect(
      fetchDocument(URL_A, { fetchImpl, config: testConfig({ maxRedirects: 2 }) }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REDIRECTS' });
  });

  it('rejects a redirect without a Location header', async () => {
    const { fetchImpl } = stubFetch({ [URL_A]: { status: 302 } });

    await expect(fetchDocument(URL_A, { fetchImpl, config: testConfig() })).rejects.toMatchObject({
      code: 'HTTP_ERROR',
    });
  });

  it('maps 4xx and 5xx responses to typed errors', async () => {
    const client = stubFetch({ [URL_A]: { status: 403, body: 'nope' } });
    await expect(
      fetchDocument(URL_A, { fetchImpl: client.fetchImpl, config: testConfig() }),
    ).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      retryable: false,
    });

    const server = stubFetch({ [URL_A]: { status: 500, body: 'boom' } });
    await expect(
      fetchDocument(URL_A, { fetchImpl: server.fetchImpl, config: testConfig(), retries: 0 }),
    ).rejects.toMatchObject({ code: 'HTTP_ERROR', retryable: true });
  });

  it('retries transient failures and then succeeds', async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) return new Response('boom', { status: 502 });
      return new Response('<p>ok</p>', { status: 200, headers: { 'content-type': 'text/html' } });
    }) as unknown as typeof globalThis.fetch;

    const document = await fetchDocument(URL_A, { fetchImpl, config: testConfig(), retries: 1 });

    expect(attempts).toBe(2);
    expect(document.body).toBe('<p>ok</p>');
  });

  it('does not retry permanent failures', async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts += 1;
      return new Response('gone', { status: 410 });
    }) as unknown as typeof globalThis.fetch;

    await expect(
      fetchDocument(URL_A, { fetchImpl, config: testConfig(), retries: 3 }),
    ).rejects.toMatchObject({ code: 'HTTP_ERROR' });
    expect(attempts).toBe(1);
  });

  it('aborts and reports a timeout', async () => {
    const fetchImpl = ((_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      })) as typeof globalThis.fetch;

    await expect(
      fetchDocument(URL_A, { fetchImpl, config: testConfig(), timeoutMs: 1_000, retries: 0 }),
    ).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true });
  });

  it('rejects responses that declare more bytes than the cap', async () => {
    const { fetchImpl } = stubFetch({
      [URL_A]: { body: 'x'.repeat(100), headers: { 'content-length': '99999999' } },
    });

    await expect(
      fetchDocument(URL_A, { fetchImpl, config: testConfig({ maxBytes: 10_000 }) }),
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
  });

  it('truncates a body that streams past the cap', async () => {
    const { fetchImpl } = stubFetch({ [URL_A]: { body: 'y'.repeat(50_000) } });
    const document = await fetchDocument(URL_A, {
      fetchImpl,
      config: testConfig({ maxBytes: 10_000 }),
    });

    expect(document.truncated).toBe(true);
    expect(document.bytes).toBe(10_000);
  });

  it('rejects non-text content types', async () => {
    const { fetchImpl } = stubFetch({
      [URL_A]: { body: 'jpegdata', headers: { 'content-type': 'image/jpeg' } },
    });

    await expect(fetchDocument(URL_A, { fetchImpl, config: testConfig() })).rejects.toMatchObject({
      code: 'UNSUPPORTED_CONTENT_TYPE',
    });
  });

  it('accepts plain text and XML documents', async () => {
    for (const contentType of ['text/plain', 'application/xml', 'application/rss+xml']) {
      const { fetchImpl } = stubFetch({
        [URL_A]: { body: 'data', headers: { 'content-type': contentType } },
      });
      const document = await fetchDocument(URL_A, { fetchImpl, config: testConfig() });
      expect(document.body).toBe('data');
    }
  });

  it('serves repeat requests from the cache', async () => {
    const { fetchImpl, calls } = stubFetch({ [URL_A]: { body: '<p>cached</p>' } });
    const cache = new TtlCache<FetchedDocument>(60_000, 10);
    const options = { fetchImpl, config: testConfig(), cache };

    const first = await fetchDocument(URL_A, options);
    const second = await fetchDocument(URL_A, options);

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.body).toBe('<p>cached</p>');
    expect(calls).toHaveLength(1);
  });

  it('refuses non-http schemes and malformed URLs before fetching', async () => {
    const { fetchImpl, calls } = stubFetch({ [URL_A]: { body: 'x' } });

    await expect(
      fetchDocument('file:///etc/passwd', { fetchImpl, config: testConfig() }),
    ).rejects.toMatchObject({ code: 'BLOCKED_SCHEME' });
    await expect(
      fetchDocument('¯\\_(ツ)_/¯', { fetchImpl, config: testConfig() }),
    ).rejects.toMatchObject({
      code: 'INVALID_URL',
    });
    expect(calls).toHaveLength(0);
  });

  it('blocks loopback and cloud metadata addresses when the guard is on', async () => {
    const { fetchImpl, calls } = stubFetch({ [URL_A]: { body: 'x' } });
    const config = loadConfig({});

    await expect(
      fetchDocument('http://127.0.0.1:8080/admin', { fetchImpl, config }),
    ).rejects.toMatchObject({ code: 'BLOCKED_HOST' });
    await expect(
      fetchDocument('http://169.254.169.254/latest/meta-data/', { fetchImpl, config }),
    ).rejects.toMatchObject({ code: 'BLOCKED_HOST' });
    await expect(fetchDocument('http://localhost/', { fetchImpl, config })).rejects.toMatchObject({
      code: 'BLOCKED_HOST',
    });
    expect(calls).toHaveLength(0);
  });

  it('blocks a redirect that lands on a private address', async () => {
    // A literal public IP avoids DNS, so the test stays offline while still
    // proving the guard runs on every hop, not just the first one.
    const { fetchImpl } = stubFetch({
      'https://93.184.216.34/start': {
        status: 302,
        headers: { location: 'http://192.168.1.1/admin' },
      },
    });

    await expect(
      fetchDocument('https://93.184.216.34/start', {
        fetchImpl,
        config: testConfig({ blockPrivateHosts: true }),
      }),
    ).rejects.toMatchObject({ code: 'BLOCKED_HOST' });
  });
});

describe('charset handling', () => {
  it('reads the charset from the Content-Type header', () => {
    expect(charsetFromContentType('text/html; charset=ISO-8859-2')).toBe('iso-8859-2');
    expect(charsetFromContentType('text/html')).toBeNull();
    expect(charsetFromContentType(null)).toBeNull();
  });

  it('sniffs a meta charset when the header is silent', () => {
    const html = Buffer.from('<html><head><meta charset="windows-1250"></head>', 'latin1');
    expect(sniffCharset(new Uint8Array(html))).toBe('windows-1250');
  });

  it('decodes legacy encodings correctly', async () => {
    const body = Buffer.from('<p>P\xf8\xed\xb9ern\xfd</p>', 'latin1');
    const { fetchImpl } = stubFetch({
      [URL_A]: {
        body: new Uint8Array(body),
        headers: { 'content-type': 'text/html; charset=iso-8859-2' },
      },
    });

    const document = await fetchDocument(URL_A, { fetchImpl, config: testConfig() });
    expect(document.charset).toBe('iso-8859-2');
    expect(document.body).toContain('Příšerný');
  });
});
