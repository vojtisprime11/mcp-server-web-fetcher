import { describe, it, expect } from "vitest";
import { htmlToMarkdown, extractMetadata, extractLinks } from "../src/utils/html-processor.js";

describe("htmlToMarkdown", () => {
  it("converts basic HTML to Markdown", () => {
    const html = `
      <html>
        <body>
          <h1>Test Title</h1>
          <p>This is a <strong>test</strong> paragraph.</p>
        </body>
      </html>
    `;
    const markdown = htmlToMarkdown(html);
    expect(markdown).toContain("# Test Title");
    expect(markdown).toContain("**test**");
  });

  it("removes script and style tags", () => {
    const html = `
      <html>
        <body>
          <p>Visible content</p>
          <script>console.log('hidden');</script>
          <style>.test { color: red; }</style>
        </body>
      </html>
    `;
    const markdown = htmlToMarkdown(html);
    expect(markdown).toContain("Visible content");
    expect(markdown).not.toContain("hidden");
    expect(markdown).not.toContain("color: red");
  });

  it("handles empty or invalid HTML gracefully", () => {
    expect(htmlToMarkdown("")).toBe("");
    expect(htmlToMarkdown("<html></html>")).toBe("");
  });

  it("preserves code blocks", () => {
    const html = `
      <html>
        <body>
          <pre><code>const x = 42;</code></pre>
        </body>
      </html>
    `;
    const markdown = htmlToMarkdown(html);
    expect(markdown).toContain("const x = 42;");
  });
});

describe("extractMetadata", () => {
  it("extracts basic metadata", () => {
    const html = `
      <html>
        <head>
          <title>Test Page</title>
          <meta name="description" content="Test description">
          <meta name="keywords" content="test, keywords">
          <meta name="author" content="Test Author">
        </head>
        <body></body>
      </html>
    `;
    const metadata = extractMetadata(html);
    expect(metadata.title).toBe("Test Page");
    expect(metadata.description).toBe("Test description");
    expect(metadata.keywords).toBe("test, keywords");
    expect(metadata.author).toBe("Test Author");
  });

  it("extracts OpenGraph tags", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="OG Title">
          <meta property="og:description" content="OG Description">
          <meta property="og:image" content="https://example.com/image.jpg">
          <meta property="og:url" content="https://example.com">
        </head>
        <body></body>
      </html>
    `;
    const metadata = extractMetadata(html);
    expect(metadata.ogTitle).toBe("OG Title");
    expect(metadata.ogDescription).toBe("OG Description");
    expect(metadata.ogImage).toBe("https://example.com/image.jpg");
    expect(metadata.ogUrl).toBe("https://example.com");
  });

  it("extracts Twitter Card tags", () => {
    const html = `
      <html>
        <head>
          <meta name="twitter:card" content="summary">
          <meta name="twitter:title" content="Twitter Title">
          <meta name="twitter:description" content="Twitter Description">
          <meta name="twitter:image" content="https://example.com/twitter.jpg">
        </head>
        <body></body>
      </html>
    `;
    const metadata = extractMetadata(html);
    expect(metadata.twitterCard).toBe("summary");
    expect(metadata.twitterTitle).toBe("Twitter Title");
    expect(metadata.twitterDescription).toBe("Twitter Description");
    expect(metadata.twitterImage).toBe("https://example.com/twitter.jpg");
  });

  it("extracts headers", () => {
    const html = `
      <html>
        <body>
          <h1>Header 1</h1>
          <h1>Header 1 Duplicate</h1>
          <h2>Header 2</h2>
          <h3>Header 3</h3>
        </body>
      </html>
    `;
    const metadata = extractMetadata(html);
    expect(metadata.headers.h1).toEqual(["Header 1", "Header 1 Duplicate"]);
    expect(metadata.headers.h2).toEqual(["Header 2"]);
    expect(metadata.headers.h3).toEqual(["Header 3"]);
  });

  it("returns null for missing metadata", () => {
    const html = "<html><body></body></html>";
    const metadata = extractMetadata(html);
    expect(metadata.title).toBeNull();
    expect(metadata.description).toBeNull();
    expect(metadata.ogTitle).toBeNull();
  });
});

describe("extractLinks", () => {
  it("extracts internal and external links", () => {
    const html = `
      <html>
        <body>
          <a href="https://example.com/page1">Internal Link 1</a>
          <a href="/page2">Internal Link 2</a>
          <a href="https://external.com">External Link</a>
        </body>
      </html>
    `;
    const links = extractLinks(html, "https://example.com");
    
    const internalLinks = links.filter((l) => l.type === "internal");
    const externalLinks = links.filter((l) => l.type === "external");
    
    expect(internalLinks).toHaveLength(2);
    expect(externalLinks).toHaveLength(1);
    expect(externalLinks[0].href).toBe("https://external.com/");
  });

  it("excludes invalid links", () => {
    const html = `
      <html>
        <body>
          <a href="#anchor">Anchor</a>
          <a href="javascript:void(0)">JavaScript</a>
          <a href="mailto:test@example.com">Email</a>
          <a href="https://example.com/valid">Valid</a>
        </body>
      </html>
    `;
    const links = extractLinks(html, "https://example.com");
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe("https://example.com/valid");
  });

  it("extracts link text and title", () => {
    const html = `
      <html>
        <body>
          <a href="https://example.com/test" title="Test Title">Test Link</a>
        </body>
      </html>
    `;
    const links = extractLinks(html, "https://example.com");
    expect(links[0].text).toBe("Test Link");
    expect(links[0].title).toBe("Test Title");
  });

  it("handles relative URLs correctly", () => {
    const html = `
      <html>
        <body>
          <a href="/path">Relative Path</a>
          <a href="./page">Current Dir</a>
          <a href="../parent">Parent Dir</a>
        </body>
      </html>
    `;
    const links = extractLinks(html, "https://example.com/section/");
    expect(links.every((l) => l.href.startsWith("https://"))).toBe(true);
  });
});
