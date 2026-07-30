/**
 * Typed, user-facing error handling.
 *
 * Every failure an MCP client can trigger is mapped to a stable `code`, so an
 * LLM (or a human) can react to it without parsing English error strings.
 */

export const ERROR_CODES = [
  'INVALID_URL',
  'BLOCKED_SCHEME',
  'BLOCKED_HOST',
  'DNS_FAILURE',
  'TIMEOUT',
  'HTTP_ERROR',
  'TOO_MANY_REDIRECTS',
  'RESPONSE_TOO_LARGE',
  'UNSUPPORTED_CONTENT_TYPE',
  'ROBOTS_DISALLOWED',
  'NETWORK_ERROR',
  'PARSE_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface WebFetcherErrorDetails {
  /** URL that was being processed when the error occurred. */
  url?: string;
  /** HTTP status code, when the failure came from an HTTP response. */
  status?: number;
  /** Additional, JSON-serialisable context. */
  [key: string]: unknown;
}

/** Error type thrown by every module in this package. */
export class WebFetcherError extends Error {
  public readonly code: ErrorCode;
  public readonly details: WebFetcherErrorDetails;
  /** True when retrying the same request later could plausibly succeed. */
  public readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    details: WebFetcherErrorDetails = {},
    options: { cause?: unknown; retryable?: boolean } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'WebFetcherError';
    this.code = code;
    this.details = details;
    this.retryable = options.retryable ?? defaultRetryable(code, details.status);
  }

  toJSON(): { code: ErrorCode; message: string; retryable: boolean } & WebFetcherErrorDetails {
    return { code: this.code, message: this.message, retryable: this.retryable, ...this.details };
  }
}

function defaultRetryable(code: ErrorCode, status?: number): boolean {
  if (code === 'TIMEOUT' || code === 'NETWORK_ERROR' || code === 'DNS_FAILURE') return true;
  if (code === 'HTTP_ERROR') return status === 408 || status === 429 || (status ?? 0) >= 500;
  return false;
}

/** Normalises anything thrown at runtime into a {@link WebFetcherError}. */
export function toWebFetcherError(error: unknown, url?: string): WebFetcherError {
  if (error instanceof WebFetcherError) return error;

  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return new WebFetcherError('TIMEOUT', 'The request was aborted before it completed.', {
        url,
      });
    }
    return new WebFetcherError('NETWORK_ERROR', error.message, { url }, { cause: error });
  }

  return new WebFetcherError('NETWORK_ERROR', `Unknown failure: ${String(error)}`, { url });
}

/** Short, human-readable hint appended to error text to help the caller recover. */
export function recoveryHint(code: ErrorCode): string {
  switch (code) {
    case 'INVALID_URL':
      return 'Pass an absolute URL including the scheme, e.g. https://example.com/page.';
    case 'BLOCKED_SCHEME':
      return 'Only http:// and https:// URLs can be fetched.';
    case 'BLOCKED_HOST':
      return 'Set WEB_FETCHER_ALLOW_PRIVATE_HOSTS=true to allow loopback/private addresses.';
    case 'TIMEOUT':
      return 'Increase `timeoutMs` (max 120000) or retry later.';
    case 'HTTP_ERROR':
      return 'Check the URL, or retry later if the status is 429/5xx.';
    case 'RESPONSE_TOO_LARGE':
      return 'Raise WEB_FETCHER_MAX_BYTES or target a smaller page.';
    case 'UNSUPPORTED_CONTENT_TYPE':
      return 'This tool handles HTML, XHTML, XML and plain text documents.';
    case 'ROBOTS_DISALLOWED':
      return 'Unset WEB_FETCHER_RESPECT_ROBOTS to skip robots.txt enforcement.';
    case 'TOO_MANY_REDIRECTS':
      return 'The URL redirect chain exceeded the configured limit.';
    default:
      return 'Verify network connectivity and the target URL.';
  }
}
