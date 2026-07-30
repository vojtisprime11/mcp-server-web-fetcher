import { describe, expect, it } from 'vitest';
import { runExtractMetadata } from '../src/tools/extractMetadata.js';
import { ARTICLE_HTML, ARTICLE_URL, stubFetch, testConfig } from './helpers.js';

function deps(html = ARTICLE_HTML, headers: Record<string, string> = {}) {
  const { fetchImpl } = stubFetch({ [ARTICLE_URL]: { body: html, headers } });
  return { fetchImpl, config: testConfig() };
}

describe('extract_metadata', () => {
  it('extracts the core metadata fields', async () => {
    const result = await runExtractMetadata({ url: ARTICLE_URL }, deps());

    expect(result.title).toBe('How caching works — Example Blog');
    expect(result.description).toBe('A deep dive into HTTP caching.');
    expect(result.canonical).toBe('https://example.com/blog/post');
    expect(result.language).toBe('en');
    expect(result.author).toBe('Ada Lovelace');
    expect(result.robots).toBe('index, follow');
    expect(result.publishedTime).toBe('2026-01-15T09:00:00Z');
    expect(result.charset).toBe('utf-8');
    expect(result.wordCount).toBeGreaterThan(20);
  });

  it('collects Open Graph and Twitter card tags', async () => {
    const result = await runExtractMetadata({ url: ARTICLE_URL }, deps());

    expect(result.openGraph).toMatchObject({
      title: 'How caching works',
      type: 'article',
      description: 'A deep dive into HTTP caching.',
    });
    expect(result.twitter).toMatchObject({ card: 'summary_large_image', site: '@example' });
  });

  it('resolves favicon, hreflang alternates and feeds to absolute URLs', async () => {
    const result = await runExtractMetadata({ url: ARTICLE_URL }, deps());

    expect(result.favicon).toBe('https://example.com/favicon.ico');
    expect(result.alternates).toEqual([
      { hreflang: 'de', href: 'https://example.com/de/blog/post' },
    ]);
    expect(result.feeds).toEqual([
      { title: 'Feed', href: 'https://example.com/feed.xml', type: 'application/rss+xml' },
    ]);
  });

  it('parses valid JSON-LD and skips malformed blocks', async () => {
    const result = await runExtractMetadata({ url: ARTICLE_URL }, deps());

    expect(result.jsonLd).toEqual([{ '@type': 'Article', headline: 'How caching works' }]);
  });

  it('returns the heading outline with levels and ids', async () => {
    const result = await runExtractMetadata({ url: ARTICLE_URL }, deps());

    expect(result.headings).toEqual([
      { level: 1, text: 'How caching works', id: null },
      { level: 2, text: 'Directives', id: null },
    ]);
  });

  it('includes HTTP response headers, lower-cased', async () => {
    const result = await runExtractMetadata(
      { url: ARTICLE_URL },
      deps(ARTICLE_HTML, { 'X-Cache': 'HIT' }),
    );

    expect(result.httpHeaders?.['x-cache']).toBe('HIT');
    expect(result.httpHeaders?.['content-type']).toContain('text/html');
  });

  it('honours the include flags', async () => {
    const result = await runExtractMetadata(
      { url: ARTICLE_URL, includeJsonLd: false, includeHeadings: false, includeHttpHeaders: false },
      deps(),
    );

    expect(result.jsonLd).toEqual([]);
    expect(result.headings).toEqual([]);
    expect(result.httpHeaders).toBeNull();
  });

  it('returns nulls for a bare document instead of throwing', async () => {
    const result = await runExtractMetadata(
      { url: ARTICLE_URL },
      deps('<html><body><p>hi</p></body></html>'),
    );

    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
    expect(result.canonical).toBeNull();
    expect(result.openGraph).toEqual({});
    expect(result.headings).toEqual([]);
  });

  it('resolves metadata against <base href> when present', async () => {
    const html = `<html><head><base href="https://cdn.example.com/v2/">
      <link rel="canonical" href="page.html"><title>Based</title></head><body>x</body></html>`;
    const result = await runExtractMetadata({ url: ARTICLE_URL }, deps(html));

    expect(result.canonical).toBe('https://cdn.example.com/v2/page.html');
  });

  it('rejects unsupported content types', async () => {
    const { fetchImpl } = stubFetch({
      [ARTICLE_URL]: { body: 'binary', headers: { 'content-type': 'application/pdf' } },
    });

    await expect(
      runExtractMetadata({ url: ARTICLE_URL }, { fetchImpl, config: testConfig() }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTENT_TYPE' });
  });
});
