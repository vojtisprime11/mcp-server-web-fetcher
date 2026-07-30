import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  WebFetcherError,
  recoveryHint,
  toWebFetcherError,
} from '../src/lib/errors.js';
import { toolError } from '../src/tools/shared.js';

describe('WebFetcherError', () => {
  it('serialises code, message, retryability and details', () => {
    const error = new WebFetcherError('HTTP_ERROR', 'boom', { url: 'https://x.test', status: 429 });

    expect(error.toJSON()).toEqual({
      code: 'HTTP_ERROR',
      message: 'boom',
      retryable: true,
      url: 'https://x.test',
      status: 429,
    });
  });

  it('derives retryability from the status code', () => {
    expect(new WebFetcherError('HTTP_ERROR', 'x', { status: 500 }).retryable).toBe(true);
    expect(new WebFetcherError('HTTP_ERROR', 'x', { status: 429 }).retryable).toBe(true);
    expect(new WebFetcherError('HTTP_ERROR', 'x', { status: 404 }).retryable).toBe(false);
    expect(new WebFetcherError('TIMEOUT', 'x').retryable).toBe(true);
    expect(new WebFetcherError('BLOCKED_HOST', 'x').retryable).toBe(false);
    expect(new WebFetcherError('BLOCKED_HOST', 'x', {}, { retryable: true }).retryable).toBe(true);
  });
});

describe('toWebFetcherError', () => {
  it('passes through its own error type', () => {
    const original = new WebFetcherError('PARSE_ERROR', 'nope');
    expect(toWebFetcherError(original)).toBe(original);
  });

  it('maps abort errors to TIMEOUT', () => {
    const aborted = new DOMException('aborted', 'AbortError');
    expect(toWebFetcherError(aborted).code).toBe('TIMEOUT');
  });

  it('maps unknown failures to NETWORK_ERROR', () => {
    expect(toWebFetcherError(new Error('socket hang up')).code).toBe('NETWORK_ERROR');
    expect(toWebFetcherError('weird').code).toBe('NETWORK_ERROR');
    expect(toWebFetcherError('weird').message).toContain('weird');
  });
});

describe('recoveryHint', () => {
  it('returns actionable advice for every error code', () => {
    for (const code of ERROR_CODES) {
      expect(recoveryHint(code).length).toBeGreaterThan(10);
    }
  });
});

describe('toolError', () => {
  it('produces an MCP error result carrying the machine-readable code', () => {
    const result = toolError(new WebFetcherError('TIMEOUT', 'too slow'), 'https://x.test');
    const [block] = result.content as Array<{ text: string }>;

    expect(result.isError).toBe(true);
    expect(block?.text).toContain('TIMEOUT: too slow');
    expect(block?.text).toContain('Retryable: yes');
    expect((result.structuredContent as { error: { code: string } }).error.code).toBe('TIMEOUT');
  });
});
