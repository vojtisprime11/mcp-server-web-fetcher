# MCP Server Web Fetcher

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple.svg)](https://modelcontextprotocol.io/)

A fast, lightweight **Model Context Protocol (MCP)** server that fetches any web page, strips HTML bloat, converts it into clean Markdown, and extracts structured metadata for LLM analysis.

Perfect for AI agents that need to understand web content without wrestling with raw HTML, ads, navigation menus, and tracking scripts.

## ✨ Features

- **🚀 Fast & Lightweight** – Minimal dependencies, optimized for speed
- **📝 Clean Markdown Conversion** – Removes HTML noise, keeps only content
- **🔍 Metadata Extraction** – Title, description, OG tags, Twitter Cards, headers
- **🔗 Link Analysis** – Categorizes internal/external links with text and titles
- **⏱️ Configurable Timeouts** – Prevent hanging on slow pages
- **🛡️ Error Handling** – Graceful handling of HTTP errors, timeouts, and malformed HTML
- **✅ Type-Safe** – Full TypeScript with Zod validation
- **🧪 Well-Tested** – Comprehensive test coverage with Vitest

## 🚀 Quick Start

### Installation

#### Using NPM (recommended)

```bash
npm install -g mcp-server-web-fetcher
```

#### From Source

```bash
git clone https://github.com/yourusername/mcp-server-web-fetcher.git
cd mcp-server-web-fetcher
npm install
npm run build
```

### Configuration for Claude Desktop

Add this to your `claude_desktop_config.json`:

#### macOS
Location: `~/Library/Application Support/Claude/claude_desktop_config.json`

#### Windows
Location: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "web-fetcher": {
      "command": "npx",
      "args": ["-y", "mcp-server-web-fetcher"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "web-fetcher": {
      "command": "mcp-server-web-fetcher"
    }
  }
}
```

Or if running from source:

```json
{
  "mcpServers": {
    "web-fetcher": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-web-fetcher/dist/index.js"]
    }
  }
}
```

After adding the configuration, restart Claude Desktop.

## 🛠️ Available Tools

### 1. `fetch_page_markdown`

Fetches a web page and converts it to clean, LLM-friendly Markdown.

**Parameters:**
- `url` (string, required) – The URL to fetch
- `includeMetadata` (boolean, optional) – Include metadata in response (default: `false`)
- `timeout` (number, optional) – Request timeout in milliseconds (default: `10000`, range: 1000-30000)

**Example:**

```json
{
  "url": "https://example.com/article",
  "includeMetadata": true,
  "timeout": 5000
}
```

**Response:**

```json
{
  "markdown": "# Article Title\n\nThis is the clean content...",
  "url": "https://example.com/article",
  "success": true,
  "metadata": {
    "title": "Article Title",
    "description": "Article description",
    "ogTitle": "OG Title",
    "headers": {
      "h1": ["Article Title"],
      "h2": ["Section 1", "Section 2"],
      "h3": []
    }
  }
}
```

### 2. `extract_metadata`

Extracts structured metadata from a web page without converting content.

**Parameters:**
- `url` (string, required) – The URL to analyze
- `timeout` (number, optional) – Request timeout in milliseconds (default: `10000`)

**Example:**

```json
{
  "url": "https://example.com/page"
}
```

**Response:**

```json
{
  "title": "Page Title",
  "description": "Page description",
  "keywords": "keyword1, keyword2",
  "author": "Author Name",
  "canonical": "https://example.com/page",
  "ogTitle": "OG Title",
  "ogDescription": "OG Description",
  "ogImage": "https://example.com/image.jpg",
  "ogUrl": "https://example.com/page",
  "twitterCard": "summary_large_image",
  "twitterTitle": "Twitter Title",
  "twitterDescription": "Twitter Description",
  "twitterImage": "https://example.com/twitter.jpg",
  "headers": {
    "h1": ["Main Heading"],
    "h2": ["Subheading 1", "Subheading 2"],
    "h3": ["Sub-subheading"]
  }
}
```

### 3. `extract_links`

Extracts all links from a web page, categorized as internal or external.

**Parameters:**
- `url` (string, required) – The URL to analyze
- `includeExternal` (boolean, optional) – Include external links (default: `true`)
- `includeInternal` (boolean, optional) – Include internal links (default: `true`)
- `timeout` (number, optional) – Request timeout in milliseconds (default: `10000`)

**Example:**

```json
{
  "url": "https://example.com",
  "includeExternal": true,
  "includeInternal": true
}
```

**Response:**

```json
{
  "links": [
    {
      "href": "https://example.com/about",
      "text": "About Us",
      "title": "Learn more about us",
      "type": "internal"
    },
    {
      "href": "https://external.com",
      "text": "External Resource",
      "title": null,
      "type": "external"
    }
  ],
  "totalCount": 42,
  "internalCount": 28,
  "externalCount": 14,
  "url": "https://example.com"
}
```

## 💡 Usage Examples

### Fetch and Convert a Blog Post

```
User: Fetch the content from https://blog.example.com/post and summarize it

Claude: [Uses fetch_page_markdown tool]
I've fetched the blog post. Here's a summary: ...
```

### Analyze Site Structure

```
User: What pages does https://example.com link to?

Claude: [Uses extract_links tool]
The homepage links to 28 internal pages and 14 external resources...
```

### Extract SEO Information

```
User: What are the meta tags on https://example.com?

Claude: [Uses extract_metadata tool]
Here's the SEO metadata:
- Title: "Example Domain"
- Description: "..."
- OG Image: "https://example.com/og-image.jpg"
```

## 🏗️ Architecture

```
mcp-server-web-fetcher/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── types.ts              # TypeScript types & Zod schemas
│   ├── tools/
│   │   ├── fetch-page-markdown.ts
│   │   ├── extract-metadata.ts
│   │   └── extract-links.ts
│   └── utils/
│       ├── http-client.ts    # HTTP fetching with timeout
│       └── html-processor.ts # HTML parsing & conversion
├── tests/
│   ├── html-processor.test.ts
│   └── tools.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

## 🧪 Development

### Setup

```bash
git clone https://github.com/yourusername/mcp-server-web-fetcher.git
cd mcp-server-web-fetcher
npm install
```

### Build

```bash
npm run build
```

### Run Tests

```bash
npm test
```

### Watch Mode (Development)

```bash
npm run dev
```

### Lint & Format

```bash
npm run lint
npm run format
```

## 🔧 Testing with MCP Inspector

Use the official [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test your server:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## 📦 Publishing

```bash
npm run build
npm test
npm publish
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure:
- All tests pass (`npm test`)
- Code follows the existing style
- New features include tests
- Documentation is updated

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- HTML parsing by [Cheerio](https://cheerio.js.org/)
- Markdown conversion by [Turndown](https://github.com/mixmark-io/turndown)
- Validation by [Zod](https://zod.dev/)

## 🐛 Known Limitations

- JavaScript-rendered content (SPA) is not supported – only static HTML is fetched
- Some sites may block automated requests (use responsibly)
- Very large pages (>10MB) may be slow to process

## 🔮 Future Enhancements

- [ ] Support for JavaScript-rendered content (Playwright/Puppeteer)
- [ ] Rate limiting and caching
- [ ] Support for authentication/cookies
- [ ] PDF and document extraction
- [ ] Custom CSS selectors for content extraction
- [ ] Batch URL processing

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/mcp-server-web-fetcher/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/mcp-server-web-fetcher/discussions)

---

Made with ❤️ for the MCP community
