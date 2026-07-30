/**
 * End-to-end MCP protocol tests: a real client talks to a real server over an
 * in-memory transport pair, so tool registration, schema conversion and
 * structured output are all exercised the way Claude Desktop would exercise them.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';
import { TOOL_NAMES } from '../src/tools/index.js';
import { ARTICLE_HTML, ARTICLE_URL, stubFetch, testConfig } from './helpers.js';

async function connect(html = ARTICLE_HTML, status = 200) {
  const { fetchImpl, calls } = stubFetch({ [ARTICLE_URL]: { body: html, status } });
  const server = createServer({ fetchImpl, config: testConfig() });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server, calls };
}

describe('MCP surface', () => {
  let context: Awaited<ReturnType<typeof connect>>;

  beforeEach(async () => {
    context = await connect();
  });

  it('advertises exactly the documented tools', async () => {
    const { tools } = await context.client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.outputSchema).toBeDefined();
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  it('publishes required and optional input parameters', async () => {
    const { tools } = await context.client.listTools();
    const fetchTool = tools.find((tool) => tool.name === 'fetch_page_markdown');

    expect(fetchTool?.inputSchema.required).toEqual(['url']);
    expect(Object.keys(fetchTool?.inputSchema.properties ?? {})).toContain('maxLength');
  });

  it('returns Markdown text plus structured content', async () => {
    const result = await context.client.callTool({
      name: 'fetch_page_markdown',
      arguments: { url: ARTICLE_URL },
    });

    const [block] = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    expect(block?.type).toBe('text');
    expect(block?.text).toContain('# How caching works');
    expect(block?.text).toContain(`Source: ${ARTICLE_URL}`);

    const structured = result.structuredContent as { markdown: string; status: number };
    expect(structured.status).toBe(200);
    expect(structured.markdown).toContain('## Directives');
  });

  it('serves extract_metadata and extract_links over the protocol', async () => {
    const metadata = await context.client.callTool({
      name: 'extract_metadata',
      arguments: { url: ARTICLE_URL },
    });
    expect((metadata.structuredContent as { title: string }).title).toContain('How caching works');

    const links = await context.client.callTool({
      name: 'extract_links',
      arguments: { url: ARTICLE_URL, scope: 'external' },
    });
    expect((links.structuredContent as { externalCount: number }).externalCount).toBe(2);
  });

  it('reports fetch failures as tool errors with a stable code', async () => {
    const failing = await connect('nope', 404);
    const result = await failing.client.callTool({
      name: 'fetch_page_markdown',
      arguments: { url: ARTICLE_URL },
    });

    expect(result.isError).toBe(true);
    const [block] = result.content as Array<{ text: string }>;
    expect(block?.text).toContain('HTTP_ERROR');
    expect(block?.text).toContain('Retryable: no');
    expect(block?.text).toContain('Hint:');
  });

  it('rejects invalid arguments before running the tool', async () => {
    const badUrl = await context.client.callTool({
      name: 'fetch_page_markdown',
      arguments: { url: 'nope' },
    });
    expect(badUrl.isError).toBe(true);
    expect((badUrl.content as Array<{ text: string }>)[0]?.text).toContain('validation');

    const missingUrl = await context.client.callTool({ name: 'extract_links', arguments: {} });
    expect(missingUrl.isError).toBe(true);

    // Nothing hit the network for either call.
    expect(context.calls).toHaveLength(0);
  });

  it('exposes usage instructions to the client', () => {
    expect(context.client.getInstructions()).toContain('fetch_page_markdown');
  });
});
