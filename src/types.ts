/**
 * Zod schemas shared by every tool.
 *
 * Input schemas are strict: unknown keys are rejected and every bound is
 * explicit, so a hallucinated parameter fails fast with a readable message
 * instead of silently changing behaviour. Output schemas are published to the
 * client as `outputSchema`, which lets callers consume `structuredContent`
 * without parsing prose.
 */

import { z } from 'zod';

export const MAX_TIMEOUT_MS = 120_000;
export const MIN_TIMEOUT_MS = 1_000;

export const urlSchema = z
  .string()
  .trim()
  .min(1, 'url must not be empty')
  .max(2_048, 'url must be at most 2048 characters')
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'url must be an absolute http(s) URL, e.g. https://example.com/page' },
  )
  .describe('Absolute http(s) URL of the page to fetch.');

export const timeoutSchema = z
  .number()
  .int()
  .min(MIN_TIMEOUT_MS)
  .max(MAX_TIMEOUT_MS)
  .optional()
  .describe(`Request timeout in milliseconds (${MIN_TIMEOUT_MS}-${MAX_TIMEOUT_MS}).`);

/* -------------------------------------------------------------------------- */
/* fetch_page_markdown                                                         */
/* -------------------------------------------------------------------------- */

export const fetchPageMarkdownInputShape = {
  url: urlSchema,
  maxLength: z
    .number()
    .int()
    .min(500)
    .max(1_000_000)
    .default(25_000)
    .describe('Maximum number of Markdown characters to return in one call.'),
  startIndex: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Character offset to start from. Use `nextStartIndex` to page through long pages.'),
  mainContentOnly: z
    .boolean()
    .default(true)
    .describe(
      'Strip navigation, headers, footers and sidebars, keeping the densest content block.',
    ),
  includeLinks: z
    .boolean()
    .default(true)
    .describe('Keep Markdown links. When false, link text is inlined as plain text.'),
  includeImages: z.boolean().default(false).describe('Keep images as Markdown image syntax.'),
  includeMetadata: z
    .boolean()
    .default(true)
    .describe('Include a short metadata summary (title, description, canonical, language).'),
  timeoutMs: timeoutSchema,
} as const;

export const fetchPageMarkdownInputSchema = z.object(fetchPageMarkdownInputShape).strict();
export type FetchPageMarkdownInput = z.infer<typeof fetchPageMarkdownInputSchema>;

const metadataSummarySchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  canonical: z.string().nullable(),
  language: z.string().nullable(),
  author: z.string().nullable(),
  publishedTime: z.string().nullable(),
});

export const fetchPageMarkdownOutputShape = {
  url: z.string().describe('Final URL after redirects.'),
  requestedUrl: z.string(),
  status: z.number().int(),
  contentType: z.string().nullable(),
  title: z.string().nullable(),
  markdown: z.string(),
  markdownLength: z.number().int(),
  totalLength: z.number().int().describe('Length of the full Markdown document.'),
  startIndex: z.number().int(),
  endIndex: z.number().int(),
  nextStartIndex: z
    .number()
    .int()
    .nullable()
    .describe('Pass as `startIndex` to fetch the next chunk, or null when complete.'),
  truncated: z.boolean(),
  wordCount: z.number().int(),
  bytesDownloaded: z.number().int(),
  elapsedMs: z.number().int(),
  fromCache: z.boolean(),
  redirects: z.array(z.string()),
  metadata: metadataSummarySchema.nullable(),
} as const;

/* -------------------------------------------------------------------------- */
/* extract_metadata                                                            */
/* -------------------------------------------------------------------------- */

export const extractMetadataInputShape = {
  url: urlSchema,
  includeJsonLd: z.boolean().default(true).describe('Include parsed JSON-LD blocks.'),
  includeHeadings: z.boolean().default(true).describe('Include the h1-h6 outline.'),
  includeHttpHeaders: z
    .boolean()
    .default(true)
    .describe('Include response headers (lower-cased keys).'),
  timeoutMs: timeoutSchema,
} as const;

export const extractMetadataInputSchema = z.object(extractMetadataInputShape).strict();
export type ExtractMetadataInput = z.infer<typeof extractMetadataInputSchema>;

export const extractMetadataOutputShape = {
  url: z.string(),
  requestedUrl: z.string(),
  status: z.number().int(),
  contentType: z.string().nullable(),
  charset: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  canonical: z.string().nullable(),
  language: z.string().nullable(),
  author: z.string().nullable(),
  publishedTime: z.string().nullable(),
  modifiedTime: z.string().nullable(),
  robots: z.string().nullable(),
  favicon: z.string().nullable(),
  openGraph: z.record(z.string(), z.string()),
  twitter: z.record(z.string(), z.string()),
  alternates: z.array(z.object({ hreflang: z.string().nullable(), href: z.string() })),
  feeds: z.array(
    z.object({ title: z.string().nullable(), href: z.string(), type: z.string().nullable() }),
  ),
  jsonLd: z.array(z.unknown()),
  headings: z.array(
    z.object({ level: z.number().int(), text: z.string(), id: z.string().nullable() }),
  ),
  httpHeaders: z.record(z.string(), z.string()).nullable(),
  wordCount: z.number().int(),
  redirects: z.array(z.string()),
  fromCache: z.boolean(),
} as const;

/* -------------------------------------------------------------------------- */
/* extract_links                                                               */
/* -------------------------------------------------------------------------- */

export const extractLinksInputShape = {
  url: urlSchema,
  scope: z
    .enum(['all', 'internal', 'external'])
    .default('all')
    .describe('Restrict results to same-site links, off-site links, or return both.'),
  includeAnchors: z
    .boolean()
    .default(false)
    .describe('Include in-page fragment links such as "#section".'),
  deduplicate: z.boolean().default(true).describe('Collapse repeated URLs to a single entry.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(2_000)
    .default(200)
    .describe('Maximum number of links to return.'),
  timeoutMs: timeoutSchema,
} as const;

export const extractLinksInputSchema = z.object(extractLinksInputShape).strict();
export type ExtractLinksInput = z.infer<typeof extractLinksInputSchema>;

export const extractLinksOutputShape = {
  url: z.string(),
  requestedUrl: z.string(),
  status: z.number().int(),
  totalFound: z.number().int().describe('Links matching the scope before the limit was applied.'),
  returned: z.number().int(),
  internalCount: z.number().int(),
  externalCount: z.number().int(),
  truncated: z.boolean(),
  links: z.array(
    z.object({
      url: z.string(),
      text: z.string(),
      title: z.string().nullable(),
      rel: z.string().nullable(),
      internal: z.boolean(),
      nofollow: z.boolean(),
    }),
  ),
  fromCache: z.boolean(),
} as const;
