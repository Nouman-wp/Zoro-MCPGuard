import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Hosted-deployment settings, set before any daemon import.
process.env.ZORO_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'zoro-test-'));
process.env.ZORO_WEB_ORIGIN = 'https://zoro.example.com/';
process.env.ZORO_CORS_ORIGINS = 'https://zoro-app.vercel.app, https://zoro-*-team.vercel.app';
process.env.RENDER_EXTERNAL_HOSTNAME = 'zoro-backend.onrender.com';
process.env.ZORO_EPHEMERAL_STORAGE = 'true';

const { config, originAllowed } = await import('../src/config');

describe('hosted deployment settings', () => {
  it('allows only the Console origin and the configured extra origins', () => {
    expect(originAllowed('https://zoro.example.com')).toBe(true);
    expect(originAllowed('https://zoro-app.vercel.app')).toBe(true);
    expect(originAllowed('https://zoro-git-feature-team.vercel.app')).toBe(true);
  });

  it('rejects everything else, including look-alike hosts', () => {
    expect(originAllowed('https://evil.example.com')).toBe(false);
    expect(originAllowed('http://zoro.example.com')).toBe(false);
    expect(originAllowed('https://zoro.example.com.evil.com')).toBe(false);
    expect(originAllowed('https://zoro-a.b-team.vercel.app')).toBe(false);
    expect(originAllowed('https://zoro-x-team.vercel.app.evil.com')).toBe(false);
    expect(originAllowed('https://zoroXexample.com')).toBe(false);
  });

  it('accepts the Render hostname on /mcp and reports ephemeral storage', async () => {
    expect(config.allowedHosts).toContain('zoro-backend.onrender.com');
    const { dependencies } = await import('../src/status');
    const storage = dependencies().find((d) => d.id === 'storage');
    expect(storage?.state).toBe('degraded');
  });
});

describe('hosted client configuration', () => {
  it('shows the public MCP address and a portable bridge command in Settings', async () => {
    const { publicMcpUrl, settingsSnippet } = await import('../src/onboarding');
    expect(publicMcpUrl()).toBe('https://zoro-backend.onrender.com/mcp');
    const s = settingsSnippet('claude-desktop');
    expect(s.command).toBe('node');
    expect(s.args).toEqual(expect.arrayContaining(['--url', 'https://zoro-backend.onrender.com/mcp', '--client', 'claude-desktop']));
    expect(s.args[0]).toContain('Backend/daemon/bin/zoro-bridge.mjs');
  });
});
