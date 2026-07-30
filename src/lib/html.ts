/**
 * HTML parsing helpers built on cheerio: noise removal, main-content detection,
 * URL resolution, metadata and link extraction.
 *
 * Everything here is synchronous and pure, which keeps it trivially testable.
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { WebFetcherError } from './errors.js';
import { isSameSite, resolveUrl } from './net.js';

/** Elements that never carry readable content. */
const NOISE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'canvas',
  'svg',
  'link',
  'meta',
  'form input',
  'button',
  '[aria-hidden="true"]',
  '[hidden]',
  '[role="banner"] nav',
  '.cookie-banner',
  '.cookie-consent',
  '#cookie-banner',
  '.advertisement',
  '.ad-slot',
  '[id^="google_ads"]',
  '[class*="newsletter-signup"]',
];

/** Removed on top of {@link NOISE_SELECTORS} when only the article body is wanted. */
const CHROME_SELECTORS = ['nav', 'aside', 'header', 'footer', '[role="navigation"]', '.sidebar'];

/** Ordered list of likely article containers, best guess first. */
const CONTENT_CANDIDATES = [
  'main',
  'article',
  '[role="main"]',
  '#main-content',
  '#main',
  '#content',
  '.post-content',
  '.entry-content',
  '.article-body',
  '.markdown-body',
  '.content',
  'body',
];

export function loadHtml(html: string): CheerioAPI {
  try {
    return cheerio.load(html);
  } catch (cause) {
    throw new WebFetcherError(
      'PARSE_ERROR',
      'The document could not be parsed as HTML.',
      {},
      {
        cause,
      },
    );
  }
}

/** Effective base URL for relative links: `<base href>` when present, else the page URL. */
export function documentBaseUrl($: CheerioAPI, pageUrl: string): string {
  const href = $('base[href]').first().attr('href');
  if (!href) return pageUrl;
  return resolveUrl(href, pageUrl) ?? pageUrl;
}

/** Rewrites `href`/`src` attributes to absolute URLs, in place. */
export function absolutiseUrls($: CheerioAPI, baseUrl: string): void {
  $('a[href]').each((_index, element) => {
    const node = $(element);
    const resolved = resolveUrl(node.attr('href') ?? '', baseUrl);
    if (resolved) node.attr('href', resolved);
    else node.removeAttr('href');
  });

  $('img[src], img[data-src]').each((_index, element) => {
    const node = $(element);
    const source = node.attr('src') ?? node.attr('data-src') ?? '';
    const resolved = resolveUrl(source, baseUrl);
    if (resolved) node.attr('src', resolved);
    else node.removeAttr('src');
  });
}

export interface CleanOptions {
  /** Drop nav/header/footer/aside and keep only the densest content block. */
  mainContentOnly: boolean;
  includeImages: boolean;
}

/** Removes noise and returns the HTML fragment worth converting to Markdown. */
export function extractContentHtml($: CheerioAPI, options: CleanOptions): string {
  $('*')
    .contents()
    .filter((_index, node) => node.type === 'comment')
    .remove();

  for (const selector of NOISE_SELECTORS) $(selector).remove();
  if (!options.includeImages) $('img, picture, figure > figcaption').remove();

  if (!options.mainContentOnly) {
    return $('body').length > 0 ? ($('body').html() ?? '') : ($.root().html() ?? '');
  }

  for (const selector of CHROME_SELECTORS) $(selector).remove();

  let best = { score: -1, html: '' };
  for (const selector of CONTENT_CANDIDATES) {
    $(selector).each((_index, element) => {
      const node = $(element);
      const html = node.html();
      if (!html) return;
      const score = scoreContent(node.text(), node.find('a').text(), selector);
      if (score > best.score) best = { score, html };
    });
  }

  if (best.html !== '') return best.html;
  return $('body').html() ?? $.root().html() ?? '';
}

/** Text density heuristic: long text with few link characters wins. */
function scoreContent(text: string, linkText: string, selector: string): number {
  const length = text.replace(/\s+/g, ' ').trim().length;
  if (length < 40) return -1;
  const linkPenalty = linkText.replace(/\s+/g, ' ').trim().length * 2;
  const bonus = selector === 'main' || selector === 'article' ? 250 : 0;
  return length - linkPenalty + bonus;
}

/* -------------------------------------------------------------------------- */
/* Metadata                                                                    */
/* -------------------------------------------------------------------------- */

export interface HeadingEntry {
  level: number;
  text: string;
  id: string | null;
}

export interface PageMetadata {
  title: string | null;
  description: string | null;
  canonical: string | null;
  language: string | null;
  author: string | null;
  publishedTime: string | null;
  modifiedTime: string | null;
  robots: string | null;
  favicon: string | null;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  jsonLd: unknown[];
  alternates: Array<{ hreflang: string | null; href: string }>;
  feeds: Array<{ title: string | null; href: string; type: string | null }>;
  headings: HeadingEntry[];
  wordCount: number;
}

export function readMetadata($: CheerioAPI, baseUrl: string): PageMetadata {
  const openGraph: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  const named: Record<string, string> = {};

  $('meta').each((_index, element) => {
    const node = $(element);
    const content = node.attr('content')?.trim();
    if (!content) return;
    const property = node.attr('property')?.trim().toLowerCase();
    const name = node.attr('name')?.trim().toLowerCase();

    if (property?.startsWith('og:')) openGraph[property.slice(3)] = content;
    else if (property?.startsWith('article:')) named[property] = content;
    else if (name?.startsWith('twitter:')) twitter[name.slice(8)] = content;
    else if (property?.startsWith('twitter:')) twitter[property.slice(8)] = content;
    else if (name) named[name] = content;
  });

  const canonicalHref = $('link[rel="canonical"]').first().attr('href');
  const iconHref =
    $('link[rel="icon"]').first().attr('href') ??
    $('link[rel="shortcut icon"]').first().attr('href') ??
    $('link[rel="apple-touch-icon"]').first().attr('href');

  const alternates: PageMetadata['alternates'] = [];
  $('link[rel="alternate"][href]').each((_index, element) => {
    const node = $(element);
    const type = node.attr('type')?.toLowerCase() ?? '';
    if (type.includes('rss') || type.includes('atom')) return;
    const href = resolveUrl(node.attr('href') ?? '', baseUrl);
    if (href) alternates.push({ hreflang: node.attr('hreflang') ?? null, href });
  });

  const feeds: PageMetadata['feeds'] = [];
  $('link[rel="alternate"][href]').each((_index, element) => {
    const node = $(element);
    const type = node.attr('type')?.toLowerCase() ?? '';
    if (!type.includes('rss') && !type.includes('atom') && !type.includes('xml')) return;
    const href = resolveUrl(node.attr('href') ?? '', baseUrl);
    if (href)
      feeds.push({ title: node.attr('title') ?? null, href, type: node.attr('type') ?? null });
  });

  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_index, element) => {
    const raw = $(element).contents().text().trim();
    if (raw === '') return;
    try {
      jsonLd.push(JSON.parse(raw));
    } catch {
      // Malformed JSON-LD is common in the wild; skip it instead of failing.
    }
  });

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  return {
    title: firstNonEmpty($('title').first().text(), openGraph.title, twitter.title),
    description: firstNonEmpty(named.description, openGraph.description, twitter.description),
    canonical: canonicalHref ? resolveUrl(canonicalHref, baseUrl) : null,
    language: firstNonEmpty($('html').attr('lang'), named['content-language']),
    author: firstNonEmpty(named.author, named['article:author'], openGraph['article:author']),
    publishedTime: firstNonEmpty(
      named['article:published_time'],
      named['date'],
      openGraph['article:published_time'],
    ),
    modifiedTime: firstNonEmpty(named['article:modified_time'], named['last-modified']),
    robots: firstNonEmpty(named.robots),
    favicon: iconHref ? resolveUrl(iconHref, baseUrl) : null,
    openGraph,
    twitter,
    jsonLd,
    alternates,
    feeds,
    headings: readHeadings($),
    wordCount: bodyText === '' ? 0 : bodyText.split(' ').length,
  };
}

export function readHeadings($: CheerioAPI): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_index, element) => {
    const node = $(element);
    const tagName = 'tagName' in element ? String(element.tagName) : 'h1';
    const text = node.text().replace(/\s+/g, ' ').trim();
    if (text === '') return;
    headings.push({
      level: Number(tagName.replace(/\D/g, '')) || 1,
      text,
      id: node.attr('id') ?? null,
    });
  });
  return headings;
}

/* -------------------------------------------------------------------------- */
/* Links                                                                       */
/* -------------------------------------------------------------------------- */

export interface PageLink {
  url: string;
  text: string;
  title: string | null;
  rel: string | null;
  /** True when the link points at the same registrable host as the page. */
  internal: boolean;
  nofollow: boolean;
}

export interface ReadLinksOptions {
  /** 'all' | 'internal' | 'external' */
  scope: 'all' | 'internal' | 'external';
  includeAnchors: boolean;
  deduplicate: boolean;
  limit: number;
}

export function readLinks($: CheerioAPI, baseUrl: string, options: ReadLinksOptions): PageLink[] {
  const base = new URL(baseUrl);
  const links: PageLink[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_index, element) => {
    const node = $(element);
    const rawHref = node.attr('href') ?? '';
    const isAnchor = rawHref.trim().startsWith('#');
    if (isAnchor && !options.includeAnchors) return;

    const resolved = isAnchor ? resolveAnchor(rawHref, baseUrl) : resolveUrl(rawHref, baseUrl);
    if (!resolved) return;

    let target: URL;
    try {
      target = new URL(resolved);
    } catch {
      return;
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return;

    const internal = isSameSite(base, target);
    if (options.scope === 'internal' && !internal) return;
    if (options.scope === 'external' && internal) return;

    if (options.deduplicate) {
      if (seen.has(resolved)) return;
      seen.add(resolved);
    }

    const rel = node.attr('rel') ?? null;
    links.push({
      url: resolved,
      text: node.text().replace(/\s+/g, ' ').trim(),
      title: node.attr('title') ?? null,
      rel,
      internal,
      nofollow: (rel ?? '').toLowerCase().includes('nofollow'),
    });
  });

  return links.slice(0, options.limit);
}

/** Keeps the fragment for in-page anchors, which `resolveUrl` deliberately drops. */
function resolveAnchor(href: string, baseUrl: string): string | null {
  const trimmed = href.trim();
  if (trimmed === '#') return null;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

function firstNonEmpty(...values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    const trimmed = value?.replace(/\s+/g, ' ').trim();
    if (trimmed) return trimmed;
  }
  return null;
}
