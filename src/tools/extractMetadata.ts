/** `extract_metadata` — title, description, OG/Twitter cards, canonical, feeds, outline. */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  documentBaseUrl,
  loadHtml,
  readMetadata,
  type HeadingEntry,
  type PageMetadata,
} from '../lib/html.js';
import { fetchDocument } from '../lib/http.js';
import {
  extractMetadataInputSchema,
  extractMetadataInputShape,
  extractMetadataOutputShape,
  type ExtractMetadataInput,
} from '../types.js';
import { asJsonText, toolError, toolResult, type ToolDeps } from './shared.js';

export interface ExtractMetadataResult extends Omit<
  PageMetadata,
  'headings' | 'jsonLd' | 'alternates' | 'feeds'
> {
  url: string;
  requestedUrl: string;
  status: number;
  contentType: string | null;
  charset: string | null;
  alternates: PageMetadata['alternates'];
  feeds: PageMetadata['feeds'];
  jsonLd: unknown[];
  headings: HeadingEntry[];
  httpHeaders: Record<string, string> | null;
  redirects: string[];
  fromCache: boolean;
}

const DESCRIPTION = [
  'Extract structured metadata from a web page without downloading it twice:',
  'title, meta description, canonical URL, language, author, publish dates,',
  'Open Graph and Twitter card tags, JSON-LD blocks, RSS/Atom feeds, hreflang',
  'alternates, the h1-h6 outline and the raw HTTP response headers.',
  'Use this to classify or summarise a page cheaply before fetching its full text.',
].join(' ');

export async function runExtractMetadata(
  rawInput: unknown,
  deps: ToolDeps = {},
): Promise<ExtractMetadataResult> {
  const input: ExtractMetadataInput = extractMetadataInputSchema.parse(rawInput);

  const document = await fetchDocument(input.url, {
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.config ? { config: deps.config } : {}),
    ...(deps.cache ? { cache: deps.cache } : {}),
  });

  const $ = loadHtml(document.body);
  const metadata = readMetadata($, documentBaseUrl($, document.url));

  return {
    url: document.url,
    requestedUrl: document.requestedUrl,
    status: document.status,
    contentType: document.contentType,
    charset: document.charset,
    title: metadata.title,
    description: metadata.description,
    canonical: metadata.canonical,
    language: metadata.language,
    author: metadata.author,
    publishedTime: metadata.publishedTime,
    modifiedTime: metadata.modifiedTime,
    robots: metadata.robots,
    favicon: metadata.favicon,
    openGraph: metadata.openGraph,
    twitter: metadata.twitter,
    alternates: metadata.alternates,
    feeds: metadata.feeds,
    jsonLd: input.includeJsonLd ? metadata.jsonLd : [],
    headings: input.includeHeadings ? metadata.headings : [],
    httpHeaders: input.includeHttpHeaders ? document.headers : null,
    wordCount: metadata.wordCount,
    redirects: document.redirects,
    fromCache: document.fromCache,
  };
}

export function registerExtractMetadata(server: McpServer, deps: ToolDeps = {}): void {
  server.registerTool(
    'extract_metadata',
    {
      title: 'Extract page metadata',
      description: DESCRIPTION,
      inputSchema: extractMetadataInputShape,
      outputSchema: extractMetadataOutputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const result = await runExtractMetadata(args, deps);
        return toolResult(asJsonText(result), { ...result });
      } catch (error) {
        return toolError(error, typeof args?.url === 'string' ? args.url : undefined);
      }
    },
  );
}
