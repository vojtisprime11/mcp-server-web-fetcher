#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import { fetchPageMarkdown } from "./tools/fetch-page-markdown.js";
import { extractMetadata } from "./tools/extract-metadata.js";
import { extractLinks } from "./tools/extract-links.js";
import {
  FetchPageMarkdownSchema,
  ExtractMetadataSchema,
  ExtractLinksSchema,
} from "./types.js";

/**
 * MCP Server for web page fetching and conversion to Markdown
 */
class WebFetcherServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "mcp-server-web-fetcher",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "fetch_page_markdown",
          description:
            "Fetches a web page and converts it to clean, LLM-friendly Markdown. Strips HTML bloat, navigation, ads, and other non-content elements. Optionally includes page metadata.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The URL of the web page to fetch",
              },
              includeMetadata: {
                type: "boolean",
                description: "Whether to include page metadata (title, description, OG tags, headers) in the response",
                default: false,
              },
              timeout: {
                type: "number",
                description: "Request timeout in milliseconds (1000-30000)",
                default: 10000,
                minimum: 1000,
                maximum: 30000,
              },
            },
            required: ["url"],
          },
        },
        {
          name: "extract_metadata",
          description:
            "Extracts structured metadata from a web page including title, description, OpenGraph tags, Twitter Card tags, canonical URL, and all H1/H2/H3 headers. Useful for understanding page structure and SEO information.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The URL of the web page to analyze",
              },
              timeout: {
                type: "number",
                description: "Request timeout in milliseconds (1000-30000)",
                default: 10000,
                minimum: 1000,
                maximum: 30000,
              },
            },
            required: ["url"],
          },
        },
        {
          name: "extract_links",
          description:
            "Extracts all links from a web page, categorized as internal (same domain) or external. Returns href, link text, title attribute, and link counts. Useful for analyzing site structure and external references.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The URL of the web page to analyze",
              },
              includeExternal: {
                type: "boolean",
                description: "Whether to include external (cross-domain) links",
                default: true,
              },
              includeInternal: {
                type: "boolean",
                description: "Whether to include internal (same-domain) links",
                default: true,
              },
              timeout: {
                type: "number",
                description: "Request timeout in milliseconds (1000-30000)",
                default: 10000,
                minimum: 1000,
                maximum: 30000,
              },
            },
            required: ["url"],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case "fetch_page_markdown": {
            const input = FetchPageMarkdownSchema.parse(args);
            const result = await fetchPageMarkdown(input);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "extract_metadata": {
            const input = ExtractMetadataSchema.parse(args);
            const result = await extractMetadata(input);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "extract_links": {
            const input = ExtractLinksSchema.parse(args);
            const result = await extractLinks(input);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        // Handle Zod validation errors
        if ((error as any).issues) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${(error as any).issues
              .map((i: any) => i.message)
              .join(", ")}`
          );
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${(error as Error).message}`
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("MCP Web Fetcher Server running on stdio");
  }
}

const server = new WebFetcherServer();
server.run().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
