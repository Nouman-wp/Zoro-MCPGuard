#!/usr/bin/env node
// Zoro stdio bridge. MCP clients that launch servers as processes launch this instead; it relays every JSON-RPC
// message to the Zoro gateway over Streamable HTTP. If the gateway is not running, requests fail with a clear error:
// the bridge never falls back to connecting to tool servers directly (FR-G12).
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : process.env[`ZORO_${name.toUpperCase().replace(/-/g, '_')}`] ?? fallback;
};

const url = arg('url', 'http://127.0.0.1:7420/mcp');
const token = arg('token', '');
const client = arg('client', 'unknown-client');
const agent = arg('agent', '');

const headers = { 'x-zoro-gateway-token': token, 'x-zoro-client': client };
if (agent) headers['x-zoro-agent'] = agent;

const stdio = new StdioServerTransport();
const http = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });

const fail = (message, original) => {
  if (original && 'id' in original && original.id !== undefined && 'method' in original) {
    void stdio.send({ jsonrpc: '2.0', id: original.id, error: { code: -32000, message } });
  }
};

stdio.onmessage = (message) => {
  http.send(message).catch((err) => {
    fail(`Zoro gateway unreachable at ${url} (${err?.message ?? err}). Your tools are unavailable until Zoro is running; Zoro does not fall back to unprotected connections.`, message);
  });
};
http.onmessage = (message) => void stdio.send(message);
http.onerror = (err) => process.stderr.write(`[zoro-bridge] ${err?.message ?? err}\n`);
stdio.onclose = () => {
  void http.close();
  process.exit(0);
};

await http.start();
await stdio.start();
