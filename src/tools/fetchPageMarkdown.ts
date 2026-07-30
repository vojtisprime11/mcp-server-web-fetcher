/** `fetch_page_markdown` — download a page and return clean, LLM-ready Markdown. */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  absolutiseUrls,
  documentBaseUrl,
  extractContentHtml,
  loadHtml,
  readMetadata,
} from '../lib/html.js';
import { fetchDocument } from '../lib/http.js';
import { htmlToMarkdown, sliceMarkdown } from '../lib/markdown.js';
import {
  fetchPageMarkdownInputSchema,
  fetchPageMarkdownInputShape,
  fetchPageMarkdownOutputShape,
  type FetchPageMarkdownInput,
} from '../types.js';
import { toolError, toolResult, type ToolDeps } from './shared.js';

export interface FetchPageMarkdownResult {
  url: string;
  requestedUrl: string;
  status: number;
  contentType: string | null;
  title: string | null;
  markdown: string;
  markdownLength: number;
  totalLength: number;
  startIndex: number;
  endIndex: number;
  nextStartIndex: number | null;
  truncated: boolean;
  wordCount: number;
  bytesDownloaded: number;
  elapsedMs: number;
  fromCache: boolean;
  redirects: string[];
  metadata: {
    title: string | null;
    description: string | null;
    canonical: string | null;
    language: string | null;
    author: string | null;
    publishedTime: string | null;
  } | null;
}

const DESCRIPTION = [
  'Fetch a web page and convert it to clean Markdown for reading or analysis.',
  'Removes scripts, styles, ads and (by default) navigation chrome, resolves relative links',
  'to absolute URLs, and keeps tables, code blocks and lists intact.',
  'Long pages are paginated: when `truncated` is true, call again with `startIndex: nextStartIndex`.',
].join(' ');

export async function runFetchPageMarkdown(
  rawInput: unknown,
  deps: ToolDeps = {},
): Promise<FetchPageMarkdownResult> {
  const input: FetchPageMarkdownInput = fetchPageMarkdownInputSchema.parse(rawInput);

  const document = await fetchDocument(input.url, {
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.config ? { config: deps.config } : {}),
    ...(deps.cache ? { cache: deps.cache } : {}),
  });

  const $ = loadHtml(document.body);
  const baseUrl = documentBaseUrl($, document.url);
  absolutiseUrls($, baseUrl);

  const metadata = readMetadata($, baseUrl);
  const contentHtml = extractContentHtml($, {
    mainContentOnly: input.mainContentOnly,
    includeImages: input.includeImages,
  });

  const fullMarkdown = htmlToMarkdown(contentHtml, {
    includeLinks: input.includeLinks,
    includeImages: input.includeImages,
  });
  const slice = sliceMarkdown(fullMarkdown, input.startIndex, input.maxLength);
  const words = slice.text.split(/\s+/).filter((word) => word !== '');

  return {
    url: document.url,
    requestedUrl: document.requestedUrl,
    status: document.status,
    contentType: document.contentType,
    title: metadata.title,
    markdown: slice.text,
    markdownLength: slice.text.length,
    totalLength: slice.totalLength,
    startIndex: slice.startIndex,
    endIndex: slice.endIndex,
    nextStartIndex: slice.nextStartIndex,
    truncated: slice.truncated || document.truncated,
    wordCount: words.length,
    bytesDownloaded: document.bytes,
    elapsedMs: document.elapsedMs,
    fromCache: document.fromCache,
    redirects: document.redirects,
    metadata: input.includeMetadata
      ? {
          title: metadata.title,
          description: metadata.description,
          canonical: metadata.canonical,
          language: metadata.language,
          author: metadata.author,
          publishedTime: metadata.publishedTime,
        }
      : null,
  };
}

export function registerFetchPageMarkdown(server: McpServer, deps: ToolDeps = {}): void {
  server.registerTool(
    'fetch_page_markdown',
    {
      title: 'Fetch page as Markdown',
      description: DESCRIPTION,
      inputSchema: fetchPageMarkdownInputShape,
      outputSchema: fetchPageMarkdownOutputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const result = await runFetchPageMarkdown(args, deps);
        const header = [
          `# ${result.title ?? result.url}`,
          '',
          `Source: ${result.url}`,
          result.truncated
            ? `Chunk: ${result.startIndex}-${result.endIndex} of ${result.totalLength} characters. ` +
              `Call again with startIndex=${result.nextStartIndex} for the rest.`
            : `Length: ${result.totalLength} characters.`,
          '',
          '---',
          '',
        ].join('\n');
        return toolResult(header + result.markdown, { ...result });
      } catch (error) {
        return toolError(error, typeof args?.url === 'string' ? args.url : undefined);
      }
    },
  );
}
