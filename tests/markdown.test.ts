import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, normaliseMarkdown, sliceMarkdown } from '../src/lib/markdown.js';
import { TtlCache } from '../src/lib/cache.js';
import { loadConfig } from '../src/lib/config.js';

describe('htmlToMarkdown', () => {
  it('converts headings, lists, emphasis and blockquotes', () => {
    const markdown = htmlToMarkdown(
      '<h2>Title</h2><ul><li>one</li><li>two</li></ul><blockquote>quoted</blockquote><em>soft</em>',
      { includeLinks: true, includeImages: false },
    );

    expect(markdown).toContain('## Title');
    expect(markdown).toContain('- one');
    expect(markdown).toContain('> quoted');
    expect(markdown).toContain('_soft_');
  });

  it('renders tables as GFM', () => {
    const markdown = htmlToMarkdown(
      '<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>',
      { includeLinks: true, includeImages: false },
    );

    expect(markdown).toContain('| a | b |');
    expect(markdown).toContain('| 1 | 2 |');
  });

  it('labels fenced code blocks with the detected language', () => {
    const markdown = htmlToMarkdown('<pre><code class="language-ts">const a = 1;</code></pre>', {
      includeLinks: true,
      includeImages: false,
    });

    expect(markdown).toBe('```ts\nconst a = 1;\n```');
  });

  it('keeps images only when requested', () => {
    const html = '<p><img src="https://cdn.test/a.png" alt="A"></p>';

    expect(htmlToMarkdown(html, { includeLinks: true, includeImages: false })).toBe('');
    expect(htmlToMarkdown(html, { includeLinks: true, includeImages: true })).toBe(
      '![A](https://cdn.test/a.png)',
    );
  });

  it('renders complex tables as pipe rows instead of leaking HTML', () => {
    const html = `<table class="infobox">
      <tr><td colspan="2"><img src="/logo.svg"></td></tr>
      <tr><th>Developed by</th><td><a href="https://a.test">Anthropic</a></td></tr>
      <tr><th>Released</th><td>2024<br>November</td></tr>
    </table>`;
    const markdown = htmlToMarkdown(html, { includeLinks: true, includeImages: false });

    expect(markdown).not.toContain('<table');
    expect(markdown).not.toContain('colspan');
    expect(markdown).toContain('| --- | --- |');
    expect(markdown).toContain('| Developed by | [Anthropic](https://a.test) |');
    expect(markdown).toContain('| Released | 2024 November |');
  });

  it('escapes pipe characters inside table cells', () => {
    const markdown = htmlToMarkdown('<table><tr><td>a|b</td><td>c</td></tr></table>', {
      includeLinks: true,
      includeImages: false,
    });

    expect(markdown).toContain('| a\\|b | c |');
  });

  it('drops anchors that would render with no text', () => {
    const markdown = htmlToMarkdown('<p><a href="https://a.test"><img src="/x.png"></a></p>', {
      includeLinks: true,
      includeImages: false,
    });

    expect(markdown).toBe('');
  });

  it('labels images that have no alt text', () => {
    expect(
      htmlToMarkdown('<img src="https://cdn.test/a.png">', {
        includeLinks: true,
        includeImages: true,
      }),
    ).toBe('![image](https://cdn.test/a.png)');
  });
});

describe('normaliseMarkdown', () => {
  it('collapses blank lines and removes zero-width characters', () => {
    expect(normaliseMarkdown('a\n\n\n\n\u200bb   \n')).toBe('a\n\nb');
  });
});

describe('sliceMarkdown', () => {
  const document = Array.from({ length: 40 }, (_, index) => `Paragraph ${index}.`).join('\n\n');

  it('returns the whole document when it fits', () => {
    const slice = sliceMarkdown(document, 0, 100_000);

    expect(slice.text).toBe(document);
    expect(slice.truncated).toBe(false);
    expect(slice.nextStartIndex).toBeNull();
    expect(slice.totalLength).toBe(document.length);
  });

  it('cuts on a paragraph boundary and reports the next offset', () => {
    const slice = sliceMarkdown(document, 0, 120);

    expect(slice.truncated).toBe(true);
    expect(slice.nextStartIndex).toBe(slice.endIndex);
    expect(slice.text.endsWith('.')).toBe(true);
  });

  it('walks the whole document across successive calls', () => {
    let cursor: number | null = 0;
    let assembled = '';
    let guard = 0;

    while (cursor !== null && guard < 100) {
      const slice = sliceMarkdown(document, cursor, 150);
      assembled += slice.text;
      cursor = slice.nextStartIndex;
      guard += 1;
    }

    expect(assembled).toBe(document);
  });

  it('clamps out-of-range offsets', () => {
    const slice = sliceMarkdown(document, 10_000, 100);

    expect(slice.text).toBe('');
    expect(slice.startIndex).toBe(document.length);
    expect(slice.truncated).toBe(false);
  });
});

describe('TtlCache', () => {
  it('expires entries and evicts the least recently used', () => {
    let now = 0;
    const cache = new TtlCache<string>(1_000, 2, () => now);

    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.get('a')).toBe('1');

    cache.set('c', '3'); // 'b' is the least recently used, so it goes.
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('3');

    now = 2_000;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('is a no-op when disabled', () => {
    const cache = new TtlCache<string>(0, 0);
    cache.set('a', '1');

    expect(cache.enabled).toBe(false);
    expect(cache.get('a')).toBeUndefined();
  });
});

describe('loadConfig', () => {
  it('falls back to safe defaults', () => {
    const config = loadConfig({});

    expect(config.blockPrivateHosts).toBe(true);
    expect(config.respectRobots).toBe(false);
    expect(config.defaultTimeoutMs).toBe(15_000);
    expect(config.userAgent).toContain('mcp-server-web-fetcher');
  });

  it('reads and clamps environment overrides', () => {
    const config = loadConfig({
      WEB_FETCHER_USER_AGENT: 'my-agent/1.0',
      WEB_FETCHER_TIMEOUT_MS: '999999',
      WEB_FETCHER_MAX_BYTES: '1',
      WEB_FETCHER_ALLOW_PRIVATE_HOSTS: 'true',
      WEB_FETCHER_RESPECT_ROBOTS: 'yes',
      WEB_FETCHER_MAX_REDIRECTS: 'not-a-number',
    });

    expect(config.userAgent).toBe('my-agent/1.0');
    expect(config.defaultTimeoutMs).toBe(120_000);
    expect(config.maxBytes).toBe(10_000);
    expect(config.blockPrivateHosts).toBe(false);
    expect(config.respectRobots).toBe(true);
    expect(config.maxRedirects).toBe(5);
  });
});
