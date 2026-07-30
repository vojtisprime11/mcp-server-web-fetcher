import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type { PageMetadata } from "../types.js";

/**
 * Configure Turndown for optimal Markdown conversion
 */
function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
  });

  // Remove script, style, and other non-content elements
  turndown.remove(["script", "style", "noscript", "iframe", "svg"]);

  return turndown;
}

/**
 * Convert HTML to clean Markdown
 */
export function htmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $("script, style, noscript, iframe, svg, nav, footer, header[role='banner']").remove();
  $(".advertisement, .ads, .cookie-banner, .popup").remove();

  // Get main content (try common content selectors)
  let content = $("main, article, [role='main'], .content, #content").html();
  
  if (!content || content.trim().length === 0) {
    content = $("body").html();
  }

  if (!content) {
    return "";
  }

  const turndown = createTurndownService();
  const markdown = turndown.turndown(content);

  // Clean up excessive whitespace
  return markdown
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract metadata from HTML
 */
export function extractMetadata(html: string): PageMetadata {
  const $ = cheerio.load(html);

  // Extract headers
  const h1Headers = $("h1")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  
  const h2Headers = $("h2")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  
  const h3Headers = $("h3")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  return {
    title: $("title").text().trim() || null,
    description: $("meta[name='description']").attr("content")?.trim() || null,
    keywords: $("meta[name='keywords']").attr("content")?.trim() || null,
    author: $("meta[name='author']").attr("content")?.trim() || null,
    canonical: $("link[rel='canonical']").attr("href")?.trim() || null,
    ogTitle: $("meta[property='og:title']").attr("content")?.trim() || null,
    ogDescription: $("meta[property='og:description']").attr("content")?.trim() || null,
    ogImage: $("meta[property='og:image']").attr("content")?.trim() || null,
    ogUrl: $("meta[property='og:url']").attr("content")?.trim() || null,
    twitterCard: $("meta[name='twitter:card']").attr("content")?.trim() || null,
    twitterTitle: $("meta[name='twitter:title']").attr("content")?.trim() || null,
    twitterDescription: $("meta[name='twitter:description']").attr("content")?.trim() || null,
    twitterImage: $("meta[name='twitter:image']").attr("content")?.trim() || null,
    headers: {
      h1: h1Headers,
      h2: h2Headers,
      h3: h3Headers,
    },
  };
}

/**
 * Extract links from HTML
 */
export function extractLinks(html: string, baseUrl: string): Array<{
  href: string;
  text: string;
  title: string | null;
  type: "internal" | "external";
}> {
  const $ = cheerio.load(html);
  const links: Array<{
    href: string;
    text: string;
    title: string | null;
    type: "internal" | "external";
  }> = [];

  const baseUrlObj = new URL(baseUrl);

  $("a[href]").each((_, element) => {
    const $link = $(element);
    const href = $link.attr("href");
    
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) {
      return;
    }

    try {
      const absoluteUrl = new URL(href, baseUrl);
      const isInternal = absoluteUrl.hostname === baseUrlObj.hostname;

      links.push({
        href: absoluteUrl.href,
        text: $link.text().trim() || "",
        title: $link.attr("title")?.trim() || null,
        type: isInternal ? "internal" : "external",
      });
    } catch {
      // Invalid URL, skip
    }
  });

  return links;
}
