import { describe, expect, it } from 'vitest';
import { runExtractLinks } from '../src/tools/extractLinks.js';
import { ARTICLE_HTML, ARTICLE_URL, stubFetch, testConfig } from './helpers.js';

function deps(html = ARTICLE_HTML) {
  const { fetchImpl } = stubFetch({ [ARTICLE_URL]: { body: html } });
  return { fetchImpl, config: testConfig() };
}

describe('extract_links', () => {
  it('returns absolute URLs split into internal and external', async () => {
    const result = await runExtractLinks({ url: ARTICLE_URL }, deps());
    const urls = result.links.map((link) => link.url);

    expect(urls).toContain('https://example.com/docs/cache-control');
    expect(urls).toContain('https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching');
    expect(result.internalCount).toBeGreaterThan(0);
    expect(result.externalCount).toBe(2);
    expect(result.returned).toBe(result.links.length);
  });

  it('captures anchor text, rel and nofollow', async () => {
    const result = await runExtractLinks({ url: ARTICLE_URL }, deps());
    const mdn = result.links.find((link) => link.url.includes('developer.mozilla.org'));

    expect(mdn).toBeDefined();
    expect(mdn?.text).toBe('MDN article');
    expect(mdn?.rel).toBe('noopener nofollow');
    expect(mdn?.nofollow).toBe(true);
    expect(mdn?.internal).toBe(false);
  });

  it('skips javascript: and fragment-only links by default', async () => {
    const result = await runExtractLinks({ url: ARTICLE_URL }, deps());
    const urls = result.links.map((link) => link.url);

    expect(urls.some((url) => url.startsWith('javascript'))).toBe(false);
    expect(result.links.some((link) => link.text === 'Jump to directives')).toBe(false);
  });

  it('includes in-page anchors when asked', async () => {
    const result = await runExtractLinks({ url: ARTICLE_URL, includeAnchors: true }, deps());

    expect(result.links.some((link) => link.text === 'Jump to directives')).toBe(true);
  });

  it('filters by scope', async () => {
    const internal = await runExtractLinks({ url: ARTICLE_URL, scope: 'internal' }, deps());
    expect(internal.links.every((link) => link.internal)).toBe(true);
    expect(internal.externalCount).toBe(0);

    const external = await runExtractLinks({ url: ARTICLE_URL, scope: 'external' }, deps());
    expect(external.links.every((link) => !link.internal)).toBe(true);
    expect(external.internalCount).toBe(0);
  });

  it('deduplicates repeated URLs unless told otherwise', async () => {
    const html = `<html><body>
      <a href="/a">One</a><a href="/a">One again</a><a href="/b">Two</a>
    </body></html>`;

    const deduplicated = await runExtractLinks({ url: ARTICLE_URL }, deps(html));
    expect(deduplicated.totalFound).toBe(2);

    const raw = await runExtractLinks({ url: ARTICLE_URL, deduplicate: false }, deps(html));
    expect(raw.totalFound).toBe(3);
  });

  it('treats www and bare hosts as the same site', async () => {
    const html = '<html><body><a href="https://www.example.com/x">x</a></body></html>';
    const result = await runExtractLinks({ url: ARTICLE_URL }, deps(html));

    expect(result.links[0]?.internal).toBe(true);
  });

  it('reports truncation when the limit is hit', async () => {
    const html = `<html><body>${Array.from({ length: 30 }, (_, index) => `<a href="/p/${index}">p${index}</a>`).join('')}</body></html>`;
    const result = await runExtractLinks({ url: ARTICLE_URL, limit: 5 }, deps(html));

    expect(result.returned).toBe(5);
    expect(result.totalFound).toBe(30);
    expect(result.truncated).toBe(true);
  });

  it('returns an empty result set for a page without links', async () => {
    const result = await runExtractLinks(
      { url: ARTICLE_URL },
      deps('<html><body>none</body></html>'),
    );

    expect(result.links).toEqual([]);
    expect(result.totalFound).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('validates the scope and limit parameters', async () => {
    await expect(
      runExtractLinks({ url: ARTICLE_URL, scope: 'sideways' }, deps()),
    ).rejects.toThrow();
    await expect(runExtractLinks({ url: ARTICLE_URL, limit: 0 }, deps())).rejects.toThrow();
    await expect(runExtractLinks({ url: ARTICLE_URL, limit: 5000 }, deps())).rejects.toThrow();
  });
});
