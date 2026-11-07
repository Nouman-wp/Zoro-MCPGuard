import { scanSkill, type SkillScan } from '@zoro/core';
import { appendLog } from './auditlog';
import { bus } from './bus';
import { all, get, run } from './db';
import { raiseIncident } from './incidents';

/** Inventory of skills, plugins, custom agents and commands, with Zoro's scan of each. */

export interface SkillRow {
  path: string;
  name: string;
  fingerprint: string;
  verdict: SkillScan['verdict'];
  findings: string;
  source: string;
  first_seen: number;
  last_seen: number;
}

export function recordSkill(file: string, scan: SkillScan, source: 'agent_write' | 'watchdog' | 'scan') {
  const now = Date.now();
  const prev = get<SkillRow>('SELECT * FROM skills WHERE path = ?', file);
  if (prev?.fingerprint === scan.fingerprint) {
    run('UPDATE skills SET last_seen = ? WHERE path = ?', now, file);
    return false;
  }
  run(
    'INSERT INTO skills(path, name, fingerprint, verdict, findings, source, first_seen, last_seen) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET name = excluded.name, fingerprint = excluded.fingerprint, verdict = excluded.verdict, findings = excluded.findings, source = excluded.source, last_seen = excluded.last_seen',
    file, scan.name, scan.fingerprint, scan.verdict, JSON.stringify(scan.findings), source, prev?.first_seen ?? now, now,
  );
  appendLog('skill', `${prev ? 'Skill changed' : 'Skill added'}: ${scan.name} (${scan.verdict})`, { path: file, findings: scan.findings.map((f) => f.id) }, file);
  if (scan.verdict !== 'clean')
    raiseIncident({
      type: 'skill_risk',
      severity: scan.verdict === 'unsafe' ? 'high' : 'medium',
      title: `${scan.verdict === 'unsafe' ? 'Unsafe' : 'Questionable'} skill ${prev ? 'changed' : 'added'}: ${scan.name}`,
      summary: scan.findings.slice(0, 3).map((f) => `${f.title}: ${f.detail}`).join(' ').slice(0, 600),
      groupKey: `skill:${file}:${scan.fingerprint}`,
      evidence: { path: file, findings: scan.findings, source },
    });
  bus.emitEvent('skill', { path: file, name: scan.name, verdict: scan.verdict });
  return true;
}

export const listSkills = () => all<SkillRow>('SELECT * FROM skills ORDER BY last_seen DESC LIMIT 500');

export const scanSkillText = (name: string, text: string) => scanSkill(name, text);
