/**
 * HTTP client utilities with timeout and error handling
 */

export interface FetchOptions {
  timeout?: number;
  headers?: Record<string, string>;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public url: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class TimeoutError extends Error {
  constructor(message: string, public url: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Fetch a URL with timeout support
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {}
): Promise<string> {
  const { timeout = 10000, headers = {} } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MCP-Web-Fetcher/1.0; +https://github.com/yourusername/mcp-server-web-fetcher)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new HttpError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        url
      );
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof HttpError) {
      throw error;
    }

    if ((error as Error).name === "AbortError") {
      throw new TimeoutError(
        `Request timeout after ${timeout}ms`,
        url
      );
    }

    throw new Error(`Failed to fetch ${url}: ${(error as Error).message}`);
  }
}
