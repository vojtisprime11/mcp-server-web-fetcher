/**
 * The HTTP layer: timeouts, byte caps, manual redirect handling, charset
 * decoding, caching and retries. Everything above this file works on strings.
 */

import { TtlCache } from './cache.js';
import { loadConfig, type ServerConfig } from './config.js';
import { WebFetcherError, toWebFetcherError } from './errors.js';
import { assertPublicHost, parseUrl } from './net.js';
import { isRobotsAllowed } from './robots.js';

export interface FetchedDocument {
  /** URL after following redirects. */
  url: string;
  /** URL originally requested. */
  requestedUrl: string;
  status: number;
  statusText: string;
  contentType: string | null;
  charset: string | null;
  /** Response headers, lower-cased keys. */
  headers: Record<string, string>;
  /** Decoded response body. */
  body: string;
  /** Number of bytes actually downloaded. */
  bytes: number;
  /** True when the body was cut off at the configured byte cap. */
  truncated: boolean;
  /** Redirect chain, excluding the final URL. */
  redirects: string[];
  elapsedMs: number;
  fromCache: boolean;
}

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  config?: ServerConfig;
  cache?: TtlCache<FetchedDocument>;
  /** Injectable for tests. */
  fetchImpl?: typeof globalThis.fetch;
  /** Number of retries for transient failures (timeouts, 5xx, network errors). */
  retries?: number;
}

const TEXTUAL_CONTENT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  'text/markdown',
  'text/xml',
  'application/xml',
  'application/rss+xml',
  'application/atom+xml',
  'application/json',
  'application/ld+json',
];

const bootConfig = loadConfig();
const documentCache = new TtlCache<FetchedDocument>(
  bootConfig.cacheTtlMs,
  bootConfig.cacheMaxEntries,
);

/** Exposed so tests and long-running hosts can drop cached responses. */
export function clearDocumentCache(): void {
  documentCache.clear();
}

/** Fetches a URL and returns a decoded, size-capped document. */
export async function fetchDocument(
  rawUrl: string,
  options: FetchOptions = {},
): Promise<FetchedDocument> {
  const config = options.config ?? loadConfig();
  const cache =
    options.cache ??
    (config.cacheTtlMs > 0 && config.cacheMaxEntries > 0 ? documentCache : undefined);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = clamp(options.timeoutMs ?? config.defaultTimeoutMs, 1_000, 120_000);
  const retries = Math.max(0, options.retries ?? 1);

  const target = parseUrl(rawUrl);
  const cacheKey = target.toString();

  const cached = cache?.get(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  let lastError: WebFetcherError | undefined;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const document = await fetchOnce(target, { ...options, config, fetchImpl, timeoutMs });
      cache?.set(cacheKey, document);
      return document;
    } catch (error) {
      lastError = toWebFetcherError(error, rawUrl);
      if (!lastError.retryable || attempt === retries) throw lastError;
      await delay(250 * (attempt + 1));
    }
  }

  /* c8 ignore next */
  throw lastError ?? new WebFetcherError('NETWORK_ERROR', 'Request failed.', { url: rawUrl });
}

async function fetchOnce(
  target: URL,
  options: FetchOptions & {
    config: ServerConfig;
    fetchImpl: typeof globalThis.fetch;
    timeoutMs: number;
  },
): Promise<FetchedDocument> {
  const { config, fetchImpl, timeoutMs } = options;
  const startedAt = Date.now();
  const redirects: string[] = [];

  let current = target;
  for (let hop = 0; hop <= config.maxRedirects; hop += 1) {
    if (config.blockPrivateHosts) await assertPublicHost(current.hostname);
    if (config.respectRobots) {
      const allowed = await isRobotsAllowed(current, { config, fetchImpl });
      if (!allowed) {
        throw new WebFetcherError(
          'ROBOTS_DISALLOWED',
          `robots.txt disallows ${current.toString()}`,
          {
            url: current.toString(),
          },
        );
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': config.userAgent,
          accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
          'accept-language': 'en,*;q=0.5',
          ...options.headers,
        },
      });
    } catch (error) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        throw new WebFetcherError(
          'TIMEOUT',
          `Request to ${current.toString()} timed out after ${timeoutMs}ms.`,
          { url: current.toString(), timeoutMs },
        );
      }
      throw toWebFetcherError(error, current.toString());
    }
    clearTimeout(timer);

    if (isRedirect(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new WebFetcherError(
          'HTTP_ERROR',
          `Received ${response.status} without a Location header.`,
          { url: current.toString(), status: response.status },
        );
      }
      await response.body?.cancel().catch(() => undefined);
      const next = parseUrl(new URL(location, current).toString());
      redirects.push(current.toString());
      current = next;
      continue;
    }

    return await readResponse(response, {
      requestedUrl: target.toString(),
      finalUrl: response.url && response.url !== '' ? response.url : current.toString(),
      redirects,
      config,
      startedAt,
    });
  }

  throw new WebFetcherError(
    'TOO_MANY_REDIRECTS',
    `Exceeded ${config.maxRedirects} redirects starting at ${target.toString()}.`,
    { url: target.toString(), redirects },
  );
}

async function readResponse(
  response: Response,
  context: {
    requestedUrl: string;
    finalUrl: string;
    redirects: string[];
    config: ServerConfig;
    startedAt: number;
  },
): Promise<FetchedDocument> {
  const { config } = context;
  const headers = headersToObject(response.headers);
  const contentType = response.headers.get('content-type');

  if (response.status >= 400) {
    await response.body?.cancel().catch(() => undefined);
    throw new WebFetcherError(
      'HTTP_ERROR',
      `${response.status} ${response.statusText || httpStatusText(response.status)} for ${context.finalUrl}`,
      { url: context.finalUrl, status: response.status },
    );
  }

  const mediaType = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (mediaType !== '' && !isTextual(mediaType)) {
    await response.body?.cancel().catch(() => undefined);
    throw new WebFetcherError(
      'UNSUPPORTED_CONTENT_TYPE',
      `Content-Type "${mediaType}" is not a text document.`,
      { url: context.finalUrl, contentType: mediaType },
    );
  }

  const declaredLength = Number(response.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declaredLength) && declaredLength > config.maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new WebFetcherError(
      'RESPONSE_TOO_LARGE',
      `Response declares ${declaredLength} bytes, which exceeds the ${config.maxBytes} byte limit.`,
      { url: context.finalUrl, bytes: declaredLength, limit: config.maxBytes },
    );
  }

  const { bytes, truncated } = await readBody(response, config.maxBytes);
  const charset = charsetFromContentType(contentType) ?? sniffCharset(bytes);
  const body = decode(bytes, charset);

  return {
    url: context.finalUrl,
    requestedUrl: context.requestedUrl,
    status: response.status,
    statusText: response.statusText || httpStatusText(response.status),
    contentType,
    charset,
    headers,
    body,
    bytes: bytes.byteLength,
    truncated,
    redirects: context.redirects,
    elapsedMs: Date.now() - context.startedAt,
    fromCache: false,
  };
}

async function readBody(
  response: Response,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.byteLength > maxBytes
      ? { bytes: buffer.subarray(0, maxBytes), truncated: true }
      : { bytes: buffer, truncated: false };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
    if (total + chunk.byteLength > maxBytes) {
      chunks.push(chunk.subarray(0, maxBytes - total));
      total = maxBytes;
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(chunk);
    total += chunk.byteLength;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
}

function decode(bytes: Uint8Array, charset: string | null): string {
  const labels = [charset, 'utf-8'].filter((label): label is string => Boolean(label));
  for (const label of labels) {
    try {
      return new TextDecoder(label, { fatal: false }).decode(bytes);
    } catch {
      continue;
    }
  }
  /* c8 ignore next */
  return Buffer.from(bytes).toString('utf8');
}

export function charsetFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const match = contentType.match(/charset\s*=\s*"?([\w-]+)"?/i);
  return match?.[1]?.toLowerCase() ?? null;
}

/** Reads `<meta charset>` from the first 2 KB of the document. */
export function sniffCharset(bytes: Uint8Array): string | null {
  const head = Buffer.from(bytes.subarray(0, 2048)).toString('latin1');
  const match =
    head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i) ??
    head.match(/encoding\s*=\s*["']([\w-]+)["']/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function isTextual(mediaType: string): boolean {
  return TEXTUAL_CONTENT_TYPES.includes(mediaType) || mediaType.startsWith('text/');
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

function httpStatusText(status: number): string {
  if (status >= 500) return 'Server Error';
  if (status >= 400) return 'Client Error';
  return 'OK';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
