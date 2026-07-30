import { fetchWithTimeout, HttpError, TimeoutError } from "../utils/http-client.js";
import { extractMetadata as extractMetadataFromHtml } from "../utils/html-processor.js";
import type { ExtractMetadataInput, PageMetadata } from "../types.js";

/**
 * Extract metadata from a web page
 */
export async function extractMetadata(
  input: ExtractMetadataInput
): Promise<PageMetadata> {
  try {
    const html = await fetchWithTimeout(input.url, {
      timeout: input.timeout,
    });

    return extractMetadataFromHtml(html);
  } catch (error) {
    if (error instanceof HttpError) {
      throw new Error(`HTTP error ${error.statusCode}: ${error.message}`);
    }
    
    if (error instanceof TimeoutError) {
      throw new Error(`Request timeout: ${error.message}`);
    }

    throw new Error(`Failed to extract metadata: ${(error as Error).message}`);
  }
}
