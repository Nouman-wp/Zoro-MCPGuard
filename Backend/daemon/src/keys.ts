import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadAuditor } from '@zoro/blockchain/auditor';
import { config } from './config';

// The Auditor identity (signing key, attestations) lives in the Blockchain package.
export { attest } from '@zoro/blockchain/auditor';

const auditor = loadAuditor();
export const auditorAccount = auditor.account;
export const auditorKeySource = auditor.source;

const TOKEN_FILE = path.join(config.dataDir, 'console.token');

function loadConsoleToken() {
  if (config.consoleToken) return config.consoleToken;
  if (existsSync(TOKEN_FILE)) return readFileSync(TOKEN_FILE, 'utf8').trim();
  const t = randomBytes(24).toString('base64url');
  writeFileSync(TOKEN_FILE, t, { mode: 0o600 });
  return t;
}
export const consoleToken = loadConsoleToken();
