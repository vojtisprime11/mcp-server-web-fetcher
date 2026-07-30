#!/usr/bin/env node
/**
 * Post-build smoke test: launches the built server over stdio with a real MCP
 * client, lists the tools and fetches a live page.
 *
 * Usage: node scripts/smoke.mjs [url]
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const url = process.argv[2] ?? 'https://example.com/';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  stderr: 'inherit',
});
const client = new Client({ name: 'smoke-test', version: '1.0.0' });

await client.connect(transport);

const { tools } = await client.listTools();
console.log(`tools: ${tools.map((tool) => tool.name).join(', ')}`);

const metadata = await client.callTool({ name: 'extract_metadata', arguments: { url } });
console.log(`title: ${metadata.structuredContent?.title ?? '(none)'}`);

const page = await client.callTool({
  name: 'fetch_page_markdown',
  arguments: { url, maxLength: 500 },
});
console.log('--- markdown preview ---');
console.log(page.content[0].text.slice(0, 400));

const links = await client.callTool({ name: 'extract_links', arguments: { url, limit: 5 } });
console.log(`links found: ${links.structuredContent?.totalFound ?? 0}`);

await client.close();
