import { z } from "zod";

/**
 * Schema for fetch_page_markdown tool input
 */
export const FetchPageMarkdownSchema = z.object({
  url: z.string().url("Must provide a valid URL"),
  includeMetadata: z.boolean().optional().default(false).describe("Whether to include page metadata in the response"),
  timeout: z.number().min(1000).max(30000).optional().default(10000).describe("Request timeout in milliseconds (1000-30000)")
});

export type FetchPageMarkdownInput = z.infer<typeof FetchPageMarkdownSchema>;

/**
 * Schema for extract_metadata tool input
 */
export const ExtractMetadataSchema = z.object({
  url: z.string().url("Must provide a valid URL"),
  timeout: z.number().min(1000).max(30000).optional().default(10000).describe("Request timeout in milliseconds (1000-30000)")
});

export type ExtractMetadataInput = z.infer<typeof ExtractMetadataSchema>;

/**
 * Schema for extract_links tool input
 */
export const ExtractLinksSchema = z.object({
  url: z.string().url("Must provide a valid URL"),
  includeExternal: z.boolean().optional().default(true).describe("Whether to include external links"),
  includeInternal: z.boolean().optional().default(true).describe("Whether to include internal links"),
  timeout: z.number().min(1000).max(30000).optional().default(10000).describe("Request timeout in milliseconds (1000-30000)")
});

export type ExtractLinksInput = z.infer<typeof ExtractLinksSchema>;

/**
 * Metadata extracted from a web page
 */
export interface PageMetadata {
  title: string | null;
  description: string | null;
  keywords: string | null;
  author: string | null;
  canonical: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogUrl: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  headers: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
}

/**
 * Link information
 */
export interface LinkInfo {
  href: string;
  text: string;
  title: string | null;
  type: "internal" | "external";
}

/**
 * Result from fetch_page_markdown
 */
export interface FetchPageResult {
  markdown: string;
  metadata?: PageMetadata;
  url: string;
  success: boolean;
}

/**
 * Result from extract_links
 */
export interface ExtractLinksResult {
  links: LinkInfo[];
  totalCount: number;
  internalCount: number;
  externalCount: number;
  url: string;
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  details?: string;
  statusCode?: number;
}
