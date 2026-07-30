#!/usr/bin/env node
/**
 * Offline release gate: starts the built binary over stdio, completes the MCP
 * handshake and asserts that every documented tool is advertised with a schema.
 *
 * No network access required, so it is safe to run in CI.
 */

import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const EXPECTED = ['fetch_page_markdown', 'extract_metadata', 'extract_links'];

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  stderr: 'inherit',
});
const client = new Client({ name: 'handshake', version: '1.0.0' });

await client.connect(transport);

const { tools } = await client.listTools();
const names = tools.map((tool) => tool.name).sort();

assert.deepEqual(names, [...EXPECTED].sort(), `unexpected tool list: ${names.join(', ')}`);
for (const tool of tools) {
  assert.ok(tool.description, `${tool.name} is missing a description`);
  assert.equal(tool.inputSchema.type, 'object', `${tool.name} has no object input schema`);
  assert.ok(tool.outputSchema, `${tool.name} is missing an output schema`);
}
assert.ok(client.getInstructions(), 'server did not send usage instructions');

console.log(`handshake ok: ${names.join(', ')}`);
await client.close();
