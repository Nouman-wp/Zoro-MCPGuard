import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  PromptListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Definition } from '@zoro/core';
import { bus } from '../bus';
import { VERSION, config } from '../config';
import { json, run } from '../db';
import { remoteArtifact, stdioArtifact, type ArtifactIdentity } from './artifact';

export interface ServerRow {
  id: string;
  name: string;
  label: string;
  transport: 'stdio' | 'http' | 'lab';
  command: string | null;
  args: string | null;
  env: string | null;
  cwd: string | null;
  url: string | null;
  headers: string | null;
  mode: 'enforce' | 'observe' | 'disabled';
  source: string;
  lab: number;
  status: string;
  last_error: string | null;
  declared_name: string | null;
  declared_version: string | null;
  artifact_id: string | null;
  artifact_detail: string | null;
  sealed_artifact_id: string | null;
  manifest_root: string | null;
  unstable: number;
  flap_count: number;
  private: number;
  publisher_verified: number;
  created_at: number;
  connected_at: number | null;
  last_change_at: number | null;
  last_refresh_at: number | null;
}

export interface Manifest {
  tools: Definition[];
  prompts: Definition[];
  resourceTemplates: Definition[];
  rejected: { kind: string; reason: string; name: string | null }[];
}

export type LabConnector = (row: ServerRow) => Promise<{ transport: Transport; artifact: ArtifactIdentity }>;
const labConnectors = new Map<string, LabConnector>();
export const registerLabConnector = (label: string, fn: LabConnector) => labConnectors.set(label, fn);

export interface UpstreamHooks {
  onManifest(up: Upstream, manifest: Manifest, trigger: string): Promise<void>;
  onConnected(up: Upstream, artifact: ArtifactIdentity): void;
  onDisconnected(up: Upstream, error: string | null): void;
}

export class Upstream {
  client: Client | null = null;
  transport: Transport | null = null;
  status: 'offline' | 'connecting' | 'online' | 'error' | 'disabled' = 'offline';
  stderrTail: string[] = [];
  private refreshTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 2_000;
  private refreshing: Promise<void> | null = null;
  private stopped = false;

  constructor(public row: ServerRow, private hooks: UpstreamHooks) {}

  get label() {
    return this.row.label;
  }

  private setStatus(status: Upstream['status'], error: string | null = null) {
    this.status = status;
    run('UPDATE servers SET status = ?, last_error = ?, connected_at = CASE WHEN ? = ? THEN ? ELSE connected_at END WHERE id = ?', status, error, status, 'online', Date.now(), this.row.id);
    this.row.status = status;
    this.row.last_error = error;
    bus.emitEvent('server', { id: this.row.id, status, error });
  }

  async start() {
    this.stopped = false;
    if (this.row.mode === 'disabled') return this.setStatus('disabled');
    await this.connect();
  }

  private async makeTransport(): Promise<{ transport: Transport; artifact: ArtifactIdentity | null }> {
    if (this.row.transport === 'lab') {
      const fn = labConnectors.get(this.row.label);
      if (!fn) throw new Error('Lab server is not available');
      return fn(this.row);
    }
    if (this.row.transport === 'http') {
      const headers = json<Record<string, string>>(this.row.headers, {});
      return { transport: new StreamableHTTPClientTransport(new URL(this.row.url!), { requestInit: { headers } }), artifact: null };
    }
    const args = json<string[]>(this.row.args, []);
    const env = { ...getDefaultEnvironment(), ...json<Record<string, string>>(this.row.env, {}) };
    const t = new StdioClientTransport({ command: this.row.command!, args, env, cwd: this.row.cwd ?? undefined, stderr: 'pipe' });
    t.stderr?.on('data', (d: Buffer) => {
      // stderr is kept in memory only for diagnostics; it is never logged to the audit log (it may contain secrets).
      this.stderrTail.push(...d.toString('utf8').split(/\r?\n/).filter(Boolean));
      if (this.stderrTail.length > 50) this.stderrTail.splice(0, this.stderrTail.length - 50);
    });
    return { transport: t, artifact: stdioArtifact(this.row.command!, args, this.row.cwd) };
  }

  async connect() {
    if (this.stopped) return;
    this.setStatus('connecting');
    try {
      const { transport, artifact: preArtifact } = await this.makeTransport();
      const client = new Client({ name: 'zoro-gateway', version: VERSION }, { capabilities: {} });
      client.setNotificationHandler(ToolListChangedNotificationSchema, () => void this.refresh('tools/list_changed'));
      client.setNotificationHandler(PromptListChangedNotificationSchema, () => void this.refresh('prompts/list_changed'));
      client.setNotificationHandler(ResourceListChangedNotificationSchema, () => void this.refresh('resources/list_changed'));
      client.onclose = () => {
        if (this.client !== client) return;
        this.client = null;
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        if (!this.stopped) {
          this.setStatus('offline', 'connection closed');
          this.hooks.onDisconnected(this, 'connection closed');
          this.scheduleReconnect();
        }
      };
      await client.connect(transport, { timeout: 30_000 });
      this.client = client;
      this.transport = transport;
      const info = client.getServerVersion();
      run('UPDATE servers SET declared_name = ?, declared_version = ? WHERE id = ?', info?.name ?? null, info?.version ?? null, this.row.id);
      this.row.declared_name = info?.name ?? null;
      this.row.declared_version = info?.version ?? null;
      const artifact = preArtifact ?? remoteArtifact(this.row.url ?? '', this.row.declared_name, this.row.declared_version);
      this.reconnectDelay = 2_000;
      this.setStatus('online');
      this.hooks.onConnected(this, artifact);
      await this.refresh('connect');
      this.refreshTimer = setInterval(() => void this.refresh('interval'), config.refreshIntervalSec * 1000);
      this.refreshTimer.unref();
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 300) ?? 'connection failed';
      this.setStatus('error', msg);
      this.hooks.onDisconnected(this, msg);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 120_000);
  }

  /** Re-read every definition. Coalesces concurrent refreshes. */
  refresh(trigger: string): Promise<void> {
    if (!this.client) return Promise.resolve();
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const manifest = await this.readManifest();
        await this.hooks.onManifest(this, manifest, trigger);
      } catch (e) {
        bus.emitEvent('server', { id: this.row.id, refreshError: (e as Error).message });
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async readManifest(): Promise<Manifest> {
    const c = this.client!;
    const caps = c.getServerCapabilities() ?? {};
    const manifest: Manifest = { tools: [], prompts: [], resourceTemplates: [], rejected: [] };
    const accept = (kind: string, d: unknown, into: Definition[]) => {
      const name = d && typeof d === 'object' && typeof (d as Definition).name === 'string' ? (d as Definition).name : null;
      if (!name) return manifest.rejected.push({ kind, reason: 'malformed definition (no name)', name: null });
      const size = Buffer.byteLength(JSON.stringify(d));
      if (size > config.maxDefinitionBytes) return manifest.rejected.push({ kind, reason: `definition is ${size} bytes (limit ${config.maxDefinitionBytes})`, name });
      into.push(d as Definition);
    };
    if (caps.tools) {
      let cursor: string | undefined;
      do {
        const r = await c.listTools(cursor ? { cursor } : undefined, { timeout: 30_000 });
        r.tools.forEach((t) => accept('tool', t, manifest.tools));
        cursor = r.nextCursor;
      } while (cursor);
    }
    if (caps.prompts) {
      let cursor: string | undefined;
      do {
        const r = await c.listPrompts(cursor ? { cursor } : undefined, { timeout: 30_000 });
        r.prompts.forEach((p) => accept('prompt', p, manifest.prompts));
        cursor = r.nextCursor;
      } while (cursor);
    }
    if (caps.resources) {
      let cursor: string | undefined;
      do {
        const r = await c.listResourceTemplates(cursor ? { cursor } : undefined, { timeout: 30_000 }).catch(() => ({ resourceTemplates: [], nextCursor: undefined }));
        r.resourceTemplates.forEach((t) => accept('resource_template', t, manifest.resourceTemplates));
        cursor = r.nextCursor;
      } while (cursor);
    }
    return manifest;
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal) {
    if (!this.client) throw new Error('server offline');
    return this.client.callTool({ name, arguments: args }, undefined, { timeout: 120_000, signal });
  }

  async getPrompt(name: string, args: Record<string, string> | undefined) {
    if (!this.client) throw new Error('server offline');
    return this.client.getPrompt({ name, arguments: args });
  }

  async listResources() {
    if (!this.client || !this.client.getServerCapabilities()?.resources) return [];
    const r = await this.client.listResources(undefined, { timeout: 20_000 });
    return r.resources;
  }

  async readResource(uri: string) {
    if (!this.client) throw new Error('server offline');
    return this.client.readResource({ uri });
  }

  async stop() {
    this.stopped = true;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const c = this.client;
    this.client = null;
    await c?.close().catch(() => undefined);
    this.setStatus(this.row.mode === 'disabled' ? 'disabled' : 'offline');
  }
}
