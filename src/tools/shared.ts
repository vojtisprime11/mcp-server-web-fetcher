/** Shared plumbing for tool handlers: dependency injection and result shaping. */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TtlCache } from '../lib/cache.js';
import type { ServerConfig } from '../lib/config.js';
import { recoveryHint, toWebFetcherError } from '../lib/errors.js';
import type { FetchedDocument } from '../lib/http.js';

/** Injectable dependencies; tests pass a stub `fetchImpl` instead of hitting the network. */
export interface ToolDeps {
  fetchImpl?: typeof globalThis.fetch;
  config?: ServerConfig;
  cache?: TtlCache<FetchedDocument>;
}

/** Wraps text + structured payload in the shape the MCP spec expects. */
export function toolResult(
  text: string,
  structuredContent: Record<string, unknown>,
): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent,
  };
}

/**
 * Converts a thrown error into a tool error result.
 *
 * Failures are reported as `isError: true` tool results rather than protocol
 * errors, so the model can read the reason and adjust its next call.
 */
export function toolError(error: unknown, url?: string): CallToolResult {
  const failure = toWebFetcherError(error, url);
  const payload = failure.toJSON();
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: [
          `${failure.code}: ${failure.message}`,
          `Retryable: ${failure.retryable ? 'yes' : 'no'}`,
          `Hint: ${recoveryHint(failure.code)}`,
        ].join('\n'),
      },
    ],
    structuredContent: { error: payload },
  };
}

/** Pretty-prints a payload for the human/LLM readable `content` block. */
export function asJsonText(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}
