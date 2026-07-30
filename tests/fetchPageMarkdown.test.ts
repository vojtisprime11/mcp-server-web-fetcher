import { describe, expect, it } from 'vitest';
import { runFetchPageMarkdown } from '../src/tools/fetchPageMarkdown.js';
import { WebFetcherError } from '../src/lib/errors.js';
import { ARTICLE_HTML, ARTICLE_URL, stubFetch, testConfig } from './helpers.js';

function deps(html = ARTICLE_HTML, status = 200) {
  const { fetchImpl, calls } = stubFetch({ [ARTICLE_URL]: { body: html, status } });
  return { deps: { fetchImpl, config: testConfig() }, calls };
}

describe('fetch_page_markdown', () => {
  it('converts a page to clean Markdown', async () => {
    const result = await runFetchPageMarkdown({ url: ARTICLE_URL }, deps().deps);

    expect(result.status).toBe(200);
    expect(result.title).toBe('How caching works — Example Blog');
    expect(result.markdown).toContain('# How caching works');
    expect(result.markdown).toContain('## Directives');
    expect(result.markdown).toContain('**not**');
    expect(result.truncated).toBe(false);
    expect(result.nextStartIndex).toBeNull();
    expect(result.wordCount).toBeGreaterThan(10);
  });

  it('strips scripts, styles, cookie banners and navigation chrome', async () => {
    const result = await runFetchPageMarkdown({ url: ARTICLE_URL }, deps().deps);

    expect(result.markdown).not.toContain('window.analytics');
    expect(result.markdown).not.toContain('color: red');
    expect(result.markdown).not.toContain('We use cookies');
    expect(result.markdown).not.toContain('Enable JavaScript');
    expect(result.markdown).not.toContain('Pricing');
    expect(result.markdown).not.toContain('Subscribe');
  });

  it('keeps GFM tables and fenced code blocks with a language hint', async () => {
    const result = await runFetchPageMarkdown({ url: ARTICLE_URL }, deps().deps);

    expect(result.markdown).toContain('| Directive | Meaning |');
    expect(result.markdown).toContain('```http');
    expect(result.markdown).toContain('Cache-Control: max-age=600');
  });

  it('resolves relative links to absolute URLs', async () => {
    const result = await runFetchPageMarkdown({ url: ARTICLE_URL }, deps().deps);

    expect(result.markdown).toContain('(https://example.com/docs/cache-control)');
    expect(result.markdown).not.toContain('(/docs/cache-control)');
  });

  it('drops images by default and includes them on request', async () => {
    const withoutImages = await runFetchPageMarkdown({ url: ARTICLE_URL }, deps().deps);
    expect(withoutImages.markdown).not.toContain('diagram.png');

    const withImages = await runFetchPageMarkdown(
      { url: ARTICLE_URL, includeImages: true },
      deps().deps,
    );
    expect(withImages.markdown).toContain('![Cache diagram](https://example.com/img/diagram.png)');
  });

  it('flattens links to plain text when includeLinks is false', async () => {
    const result = await runFetchPageMarkdown(
      { url: ARTICLE_URL, includeLinks: false },
      deps().deps,
    );

    expect(result.markdown).toContain('Cache-Control guide');
    expect(result.markdown).not.toContain('](https://example.com/docs/cache-control)');
  });

  it('keeps the full page when mainContentOnly is false', async () => {
    const result = await runFetchPageMarkdown(
      { url: ARTICLE_URL, mainContentOnly: false },
      deps().deps,
    );

    expect(result.markdown).toContain('Pricing');
  });

  it('paginates long documents through startIndex/nextStartIndex', async () => {
    const long = `<html><body><main>${'<p>Sentence number one.</p>'.repeat(400)}</main></body></html>`;
    const { deps: injected } = deps(long);

    const first = await runFetchPageMarkdown({ url: ARTICLE_URL, maxLength: 500 }, injected);
    expect(first.truncated).toBe(true);
    expect(first.markdown.length).toBeLessThanOrEqual(500);
    expect(first.nextStartIndex).toBe(first.endIndex);

    const second = await runFetchPageMarkdown(
      { url: ARTICLE_URL, maxLength: 500, startIndex: first.nextStartIndex ?? 0 },
      injected,
    );
    expect(second.startIndex).toBe(first.endIndex);
    expect(second.markdown).not.toBe(first.markdown);
    expect(second.totalLength).toBe(first.totalLength);
  });

  it('includes a metadata summary by default and omits it on request', async () => {
    const withMetadata = await runFetchPageMarkdown({ url: ARTICLE_URL }, deps().deps);
    expect(withMetadata.metadata?.description).toBe('A deep dive into HTTP caching.');
    expect(withMetadata.metadata?.canonical).toBe('https://example.com/blog/post');

    const without = await runFetchPageMarkdown(
      { url: ARTICLE_URL, includeMetadata: false },
      deps().deps,
    );
    expect(without.metadata).toBeNull();
  });

  it('survives malformed HTML', async () => {
    const broken = '<html><body><main><p>Unclosed <b>bold <div>and a stray div</main>';
    const result = await runFetchPageMarkdown({ url: ARTICLE_URL }, deps(broken).deps);

    expect(result.markdown).toContain('Unclosed');
    expect(result.markdown).toContain('stray div');
  });

  it('handles a page with no body content', async () => {
    const result = await runFetchPageMarkdown({ url: ARTICLE_URL }, deps('').deps);

    expect(result.markdown).toBe('');
    expect(result.totalLength).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('rejects invalid input before any request is made', async () => {
    const { deps: injected, calls } = deps();

    await expect(runFetchPageMarkdown({ url: 'not-a-url' }, injected)).rejects.toThrow();
    await expect(runFetchPageMarkdown({ url: 'ftp://example.com' }, injected)).rejects.toThrow();
    await expect(
      runFetchPageMarkdown({ url: ARTICLE_URL, maxLength: 10 }, injected),
    ).rejects.toThrow();
    await expect(
      runFetchPageMarkdown({ url: ARTICLE_URL, unknownOption: true }, injected),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('surfaces HTTP failures as typed errors', async () => {
    await expect(
      runFetchPageMarkdown({ url: ARTICLE_URL }, deps('nope', 503).deps),
    ).rejects.toMatchObject({ code: 'HTTP_ERROR', retryable: true });

    const notFound = await runFetchPageMarkdown({ url: ARTICLE_URL }, deps('nope', 404).deps).catch(
      (error: unknown) => error,
    );
    expect(notFound).toBeInstanceOf(WebFetcherError);
    expect((notFound as WebFetcherError).code).toBe('HTTP_ERROR');
    expect((notFound as WebFetcherError).retryable).toBe(false);
    expect((notFound as WebFetcherError).details.status).toBe(404);
  });
});
