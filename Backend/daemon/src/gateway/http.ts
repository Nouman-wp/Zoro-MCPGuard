import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { config } from '../config';
import { ClientSession } from './session';

const TOKEN_FILE = path.join(config.dataDir, 'gateway.token');
export const gatewayToken = config.gatewayToken
  ? config.gatewayToken
  : existsSync(TOKEN_FILE)
  ? readFileSync(TOKEN_FILE, 'utf8').trim()
  : (() => {
      const t = randomBytes(24).toString('base64url');
      writeFileSync(TOKEN_FILE, t, { mode: 0o600 });
      return t;
    })();

const sessions = new Map<string, { transport: WebStandardStreamableHTTPServerTransport; session: ClientSession }>();

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const rpcError = (status: number, message: string) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }), { status, headers: { 'content-type': 'application/json' } });

export const mcpSessionCount = () => sessions.size;

/** POST/GET/DELETE /mcp — the endpoint every protected MCP client connects to. */
export async function handleMcp(req: Request): Promise<Response> {
  const token = req.headers.get('x-zoro-gateway-token') ?? new URL(req.url).searchParams.get('token') ?? '';
  if (!safeEqual(token, gatewayToken)) return rpcError(401, 'Zoro gateway token missing or invalid. Re-run onboarding to update this client configuration.');
  const sid = req.headers.get('mcp-session-id');
  if (sid) {
    const s = sessions.get(sid);
    if (!s) return rpcError(404, 'Unknown or expired MCP session');
    return s.transport.handleRequest(req);
  }
  if (req.method !== 'POST') return rpcError(400, 'No MCP session; send initialize first');
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return rpcError(400, 'Invalid JSON');
  }
  const first = Array.isArray(body) ? body[0] : body;
  if (!isInitializeRequest(first)) return rpcError(400, 'No MCP session; send initialize first');
  const session = new ClientSession({ agentHint: req.headers.get('x-zoro-agent'), clientHint: req.headers.get('x-zoro-client') });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableDnsRebindingProtection: true,
    allowedHosts: [`127.0.0.1:${config.port}`, `localhost:${config.port}`, `[::1]:${config.port}`, ...config.allowedHosts],
    onsessioninitialized: (id) => {
      sessions.set(id, { transport, session });
    },
    onsessionclosed: (id) => {
      sessions.delete(id);
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };
  await session.server.connect(transport);
  return transport.handleRequest(req, { parsedBody: body });
}
