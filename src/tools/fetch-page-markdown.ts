import { fetchWithTimeout, HttpError, TimeoutError } from "../utils/http-client.js";
import { htmlToMarkdown, extractMetadata } from "../utils/html-processor.js";
import type { FetchPageMarkdownInput, FetchPageResult } from "../types.js";

/**
 * Fetch a web page and convert it to clean Markdown
 */
export async function fetchPageMarkdown(
  input: FetchPageMarkdownInput
): Promise<FetchPageResult> {
  try {
    const html = await fetchWithTimeout(input.url, {
      timeout: input.timeout,
    });

    const markdown = htmlToMarkdown(html);

    if (!markdown || markdown.trim().length === 0) {
      return {
        markdown: "",
        url: input.url,
        success: false,
      };
    }

    const result: FetchPageResult = {
      markdown,
      url: input.url,
      success: true,
    };

    if (input.includeMetadata) {
      result.metadata = extractMetadata(html);
    }

    return result;
  } catch (error) {
    if (error instanceof HttpError) {
      throw new Error(`HTTP error ${error.statusCode}: ${error.message}`);
    }
    
    if (error instanceof TimeoutError) {
      throw new Error(`Request timeout: ${error.message}`);
    }

    throw new Error(`Failed to fetch page: ${(error as Error).message}`);
  }
}
