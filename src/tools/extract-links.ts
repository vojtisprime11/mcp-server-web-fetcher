import { fetchWithTimeout, HttpError, TimeoutError } from "../utils/http-client.js";
import { extractLinks as extractLinksFromHtml } from "../utils/html-processor.js";
import type { ExtractLinksInput, ExtractLinksResult } from "../types.js";

/**
 * Extract all links from a web page
 */
export async function extractLinks(
  input: ExtractLinksInput
): Promise<ExtractLinksResult> {
  try {
    const html = await fetchWithTimeout(input.url, {
      timeout: input.timeout,
    });

    const allLinks = extractLinksFromHtml(html, input.url);

    // Filter based on user preferences
    let filteredLinks = allLinks;
    
    if (!input.includeInternal && !input.includeExternal) {
      filteredLinks = [];
    } else if (!input.includeInternal) {
      filteredLinks = allLinks.filter((link) => link.type === "external");
    } else if (!input.includeExternal) {
      filteredLinks = allLinks.filter((link) => link.type === "internal");
    }

    const internalCount = allLinks.filter((link) => link.type === "internal").length;
    const externalCount = allLinks.filter((link) => link.type === "external").length;

    return {
      links: filteredLinks,
      totalCount: allLinks.length,
      internalCount,
      externalCount,
      url: input.url,
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw new Error(`HTTP error ${error.statusCode}: ${error.message}`);
    }
    
    if (error instanceof TimeoutError) {
      throw new Error(`Request timeout: ${error.message}`);
    }

    throw new Error(`Failed to extract links: ${(error as Error).message}`);
  }
}
