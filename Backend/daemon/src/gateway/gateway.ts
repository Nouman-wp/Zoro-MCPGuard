import { randomUUID } from 'node:crypto';
import {
  HIGH_IMPACT_CAPABILITIES,
  actionDigest,
  autoReleaseFor,
  computeManifest,
  fingerprintDefinition,
  humanSealRequiredFor,
  inferCapabilities,
  slugLabel,
  type Capability,
  type ChangeClass,
  type Definition,
  type DefinitionKind,
  type RegistryState,
  type SealState,
  type VerdictPackage,
} from '@zoro/core';
import { appendLog } from '../auditlog';
import { createApproval, registerApprovalExecutor } from '../approvals';
import { bus } from '../bus';
import { config, isEnsConfigured } from '../config';
import { all, get, json, run, tx } from '../db';
import { addIncidentEvent, raiseIncident, setIncidentStatus } from '../incidents';
import { policyFor } from '../policy';
import { enqueue, publishRevocation } from '../registry/outbox';
import { latestPackage, requestAudit, sentinelEvents, type Detonator } from '../sentinel/runner';
import type { ArtifactIdentity } from './artifact';
import { Upstream, type Manifest, type ServerRow, type UpstreamHooks } from './upstream';

export interface LiveRow {
  server_id: string;
  kind: DefinitionKind;
  name: string;
  fingerprint: string;
  exposed_fingerprint: string | null;
  state: 'released' | 'quarantined' | 'blocked' | 'awaiting_release' | 'removed';
  reason: string | null;
  updated_at: number;
}

export interface SealRowLite {
  fingerprint: string;
  verdict: string;
  status: string;
  audit_id: string;
  change_class: string | null;
  ens_status: string | null;
  ens_checked_at: number | null;
  ens_check: string | null;
  expires_at: number;
  lab: number;
}

export interface SessionLike {
  notifyListChanged(kinds: DefinitionKind[]): void;
}

export interface ExposedEntry {
  exposedName: string;
  serverId: string;
  label: string;
  kind: DefinitionKind;
  name: string;
  fingerprint: string;
  definition: Definition;
}

export interface CallSealState {
  state: SealState;
  fingerprint: string | null;
  changeClass: ChangeClass | null;
  registry: RegistryState;
  highImpact: boolean;
  capabilities: Capability[];
  detail?: string;
  live: LiveRow | null;
}

const HIGH_IMPACT = new Set<Capability>(HIGH_IMPACT_CAPABILITIES);

export class Gateway implements UpstreamHooks {
  upstreams = new Map<string, Upstream>();
  sessions = new Set<SessionLike>();
  detonators = new Map<string, Detonator>();
  private notifyTimer: NodeJS.Timeout | null = null;
  private pendingKinds = new Set<DefinitionKind>();

  async init() {
    sentinelEvents.on('verdict', (fp: string, pkg: VerdictPackage) => this.onVerdict(fp, pkg));
    sentinelEvents.on('artifact_verdict', (serverId: string, pkg: VerdictPackage) => {
      const row = this.serverRow(serverId);
      if (!row || pkg.verdict !== 'unsafe') return;
      const det = pkg.findings.filter((f) => f.layer === 'detonation');
      raiseIncident({
        type: 'artifact_changed',
        severity: 'critical',
        title: `New code behind “${row.name}” behaves differently: ${det[0]?.title ?? 'unsafe'}`,
        summary: det.map((f) => f.explanation).join(' ') || 'Sentinel found the new code unsafe.',
        groupKey: `artifact:${row.id}:${row.artifact_id}`,
        serverId: row.id,
        tool: pkg.name,
        evidence: { detonation: det, fingerprint: pkg.fingerprint },
        lab: Boolean(row.lab),
        eventMessage: `Code-change audit: unsafe (${det.length} behavioral finding(s))`,
      });
    });
    registerApprovalExecutor('release', (a) => {
      const act = json<{ serverId: string; kind: DefinitionKind; name: string; fingerprint: string }>(a.action, null as never);
      return this.release(act.serverId, act.kind, act.name, act.fingerprint, `approved via APR-${a.seq}`);
    });
    registerApprovalExecutor('artifact_release', (a) => {
      const act = json<{ serverId: string; artifactId: string }>(a.action, null as never);
      return this.acceptArtifact(act.serverId, act.artifactId, `approved via APR-${a.seq}`);
    });
    for (const row of all<ServerRow>('SELECT * FROM servers ORDER BY created_at')) {
      if (row.lab) continue; // Lab servers are started by the Lab module once its connectors exist.
      void this.startServer(row);
    }
  }

  serverRow(id: string) {
    return get<ServerRow>('SELECT * FROM servers WHERE id = ?', id);
  }

  async startServer(row: ServerRow) {
    const existing = this.upstreams.get(row.id);
    if (existing) await existing.stop();
    const up = new Upstream(row, this);
    this.upstreams.set(row.id, up);
    await up.start();
  }

  addServer(input: { name: string; label?: string; transport: ServerRow['transport']; command?: string | null; args?: string[]; env?: Record<string, string>; cwd?: string | null; url?: string | null; headers?: Record<string, string>; mode?: ServerRow['mode']; source: string; lab?: boolean; private?: boolean }): ServerRow {
    const baseLabel = slugLabel(input.label ?? input.name);
    let label = baseLabel;
    for (let i = 2; get('SELECT 1 FROM servers WHERE label = ?', label); i++) label = `${baseLabel}-${i}`;
    const id = randomUUID();
    run(
      'INSERT INTO servers(id, name, label, transport, command, args, env, cwd, url, headers, mode, source, lab, private, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, input.name, label, input.transport, input.command ?? null, JSON.stringify(input.args ?? []), JSON.stringify(input.env ?? {}), input.cwd ?? null, input.url ?? null, JSON.stringify(input.headers ?? {}),
      input.mode ?? 'enforce', input.source, Boolean(input.lab), Boolean(input.private), Date.now(),
    );
    appendLog('server_change', `Server added: ${input.name} (${input.transport})`, { label, source: input.source }, id, input.lab);
    if (isEnsConfigured() && config.ens.operatorKey && !input.private && !input.lab) enqueue('ens.namespace', { label, lab: false }, label);
    const row = this.serverRow(id)!;
    if (!input.lab) void this.startServer(row);
    bus.emitEvent('server', { id, action: 'added' });
    return row;
  }

  async removeServer(id: string) {
    const up = this.upstreams.get(id);
    await up?.stop();
    this.upstreams.delete(id);
    const row = this.serverRow(id);
    run("UPDATE live SET state = 'removed', exposed_fingerprint = NULL, updated_at = ? WHERE server_id = ?", Date.now(), id);
    run('DELETE FROM servers WHERE id = ?', id);
    appendLog('server_change', `Server removed: ${row?.name ?? id}`, null, id, Boolean(row?.lab));
    this.scheduleNotify(['tool', 'prompt', 'resource_template']);
    bus.emitEvent('server', { id, action: 'removed' });
  }

  async setMode(id: string, mode: ServerRow['mode']) {
    run('UPDATE servers SET mode = ? WHERE id = ?', mode, id);
    const row = this.serverRow(id)!;
    appendLog('config_change', `Server ${row.name} mode → ${mode}`, { mode }, id, Boolean(row.lab));
    if (mode === 'disabled') await this.upstreams.get(id)?.stop();
    else if (!this.upstreams.get(id)?.client) await this.startServer(row);
    else this.upstreams.get(id)!.row.mode = mode;
    this.scheduleNotify(['tool', 'prompt', 'resource_template']);
  }

  // --- Upstream hooks ---

  onConnected(up: Upstream, artifact: ArtifactIdentity) {
    run('UPDATE servers SET artifact_id = ?, artifact_detail = ? WHERE id = ?', artifact.id, JSON.stringify(artifact.detail), up.row.id);
    up.row.artifact_id = artifact.id;
    up.row.artifact_detail = JSON.stringify(artifact.detail);
    const row = this.serverRow(up.row.id)!;
    if (row.sealed_artifact_id && artifact.id && row.sealed_artifact_id !== artifact.id) this.onArtifactChanged(row, artifact);
  }

  onDisconnected(up: Upstream, error: string | null) {
    bus.emitEvent('server', { id: up.row.id, status: up.status, error });
  }

  /** FR-G6: the code behind a server changed although its definitions may be identical. */
  private onArtifactChanged(row: ServerRow, artifact: ArtifactIdentity) {
    appendLog('server_change', `Artifact identity changed for ${row.name}`, { from: row.sealed_artifact_id, to: artifact.id }, row.id, Boolean(row.lab));
    const inc = raiseIncident({
      type: 'artifact_changed',
      severity: 'high',
      title: `Code behind “${row.name}” changed`,
      summary: `The installed code or launch target of ${row.name} no longer matches what was approved, even if its tool descriptions look the same. Its tools are unavailable until the new code is reviewed.`,
      groupKey: `artifact:${row.id}:${artifact.id}`,
      serverId: row.id,
      evidence: { previousArtifact: row.sealed_artifact_id, newArtifact: artifact.id, detail: artifact.detail },
      lab: Boolean(row.lab),
    });
    run("UPDATE live SET state = 'quarantined', reason = 'artifact_changed', exposed_fingerprint = NULL, updated_at = ? WHERE server_id = ? AND state IN ('released','awaiting_release')", Date.now(), row.id);
    this.scheduleNotify(['tool', 'prompt', 'resource_template']);
    const det = this.detonators.get(row.label);
    if (det) {
      // Lab servers can be exercised in isolation: re-audit every tool against the new code, with detonation.
      for (const v of this.liveRows(row.id).filter((l) => l.kind === 'tool' && l.state !== 'removed')) {
        const def = this.definitionOf(row.id, v.kind, v.fingerprint);
        if (def) requestAudit({ ...this.auditBase(row, v.kind, def), trigger: 'artifact_changed', source: 'artifact', force: true, detonate: det });
      }
    }
    createApproval({
      kind: 'artifact_release',
      digest: actionDigest({ kind: 'release', requestId: `artifact:${row.id}:${artifact.id}`, server: row.label, detail: { artifact: artifact.id } }),
      action: { serverId: row.id, artifactId: artifact.id },
      summary: `Accept new code for ${row.name}`,
      reason: 'The server’s artifact identity changed. Accepting it re-releases tools whose definitions are still sealed.',
      humanSeal: true,
      serverId: row.id,
      incidentId: inc.id,
      lab: Boolean(row.lab),
    });
  }

  acceptArtifact(serverId: string, artifactId: string, note: string) {
    const row = this.serverRow(serverId);
    if (!row) return 'server no longer exists';
    run('UPDATE servers SET sealed_artifact_id = ? WHERE id = ?', artifactId, serverId);
    appendLog('server_change', `Artifact accepted for ${row.name}: ${note}`, { artifactId }, serverId, Boolean(row.lab));
    for (const l of this.liveRows(serverId).filter((x) => x.reason === 'artifact_changed')) this.evaluateVersion(row, l.kind, l.name, l.fingerprint, { prevExposed: null, isBaseline: false });
    this.scheduleNotify(['tool', 'prompt', 'resource_template']);
    return 'artifact accepted';
  }

  async onManifest(up: Upstream, manifest: Manifest, trigger: string) {
    const row = this.serverRow(up.row.id);
    if (!row) return;
    let changed = false;
    const seen = new Set<string>();
    const kinds: [DefinitionKind, Definition[]][] = [['tool', manifest.tools], ['prompt', manifest.prompts], ['resource_template', manifest.resourceTemplates]];
    for (const [kind, defs] of kinds) {
      for (const def of defs) {
        seen.add(`${kind}:${def.name}`);
        if (this.ingest(row, kind, def, trigger)) {
          changed = true;
          this.pendingKinds.add(kind);
        }
      }
    }
    for (const l of this.liveRows(row.id)) {
      if (l.state === 'removed' || seen.has(`${l.kind}:${l.name}`)) continue;
      const rejected = manifest.rejected.find((r) => r.name === l.name);
      if (rejected) {
        run("UPDATE live SET state = 'quarantined', reason = ?, exposed_fingerprint = NULL, updated_at = ? WHERE server_id = ? AND kind = ? AND name = ?", `rejected: ${rejected.reason}`, Date.now(), row.id, l.kind, l.name);
      } else {
        run("UPDATE live SET state = 'removed', exposed_fingerprint = NULL, updated_at = ? WHERE server_id = ? AND kind = ? AND name = ?", Date.now(), row.id, l.kind, l.name);
        appendLog('tool_change', `${l.kind} removed upstream: ${row.label}/${l.name}`, null, row.id, Boolean(row.lab));
      }
      changed = true;
      this.pendingKinds.add(l.kind);
    }
    if (manifest.rejected.length)
      raiseIncident({
        type: 'malformed_manifest', severity: 'medium', title: `${row.name} sent definitions Zoro cannot seal`,
        summary: manifest.rejected.map((r) => `${r.kind}${r.name ? ` “${r.name}”` : ''}: ${r.reason}`).join('; '),
        groupKey: `malformed:${row.id}`, serverId: row.id, evidence: { rejected: manifest.rejected }, lab: Boolean(row.lab),
      });
    const { root } = computeManifest({ declaredName: row.declared_name, declaredVersion: row.declared_version, artifactId: row.artifact_id, tools: manifest.tools, prompts: manifest.prompts, resourceTemplates: manifest.resourceTemplates });
    const rootChanged = row.manifest_root !== root;
    run('UPDATE servers SET manifest_root = ?, last_refresh_at = ?, last_change_at = CASE WHEN ? THEN ? ELSE last_change_at END WHERE id = ?', root, Date.now(), rootChanged, Date.now(), row.id);
    this.detectFlapping(row);
    if (changed) {
      this.collisionRadar();
      this.scheduleNotify([...this.pendingKinds]);
      this.pendingKinds.clear();
      bus.emitEvent('tool', { serverId: row.id, trigger });
    }
  }

  /** Returns true when what agents may see changed. */
  private ingest(row: ServerRow, kind: DefinitionKind, def: Definition, trigger: string): boolean {
    const fp = fingerprintDefinition(kind, def);
    const now = Date.now();
    const live = get<LiveRow>('SELECT * FROM live WHERE server_id = ? AND kind = ? AND name = ?', row.id, kind, def.name);
    const known = get<{ fingerprint: string }>('SELECT fingerprint FROM versions WHERE server_id = ? AND kind = ? AND fingerprint = ?', row.id, kind, fp);
    if (known) run('UPDATE versions SET last_seen = ? WHERE server_id = ? AND kind = ? AND fingerprint = ?', now, row.id, kind, fp);
    else run('INSERT INTO versions(server_id, kind, name, fingerprint, definition, first_seen, last_seen, previous_fingerprint) VALUES(?,?,?,?,?,?,?,?)', row.id, kind, def.name, fp, JSON.stringify(def), now, now, live?.fingerprint ?? null);
    if (live && live.fingerprint === fp && live.state !== 'removed') return false;
    const isBaseline = !get('SELECT 1 FROM versions WHERE server_id = ? AND kind = ? AND name = ? AND fingerprint != ?', row.id, kind, def.name, fp);
    const prevExposed = live?.state === 'removed' ? null : live?.exposed_fingerprint ?? null;
    tx(() => {
      run(
        `INSERT INTO live(server_id, kind, name, fingerprint, exposed_fingerprint, state, reason, updated_at) VALUES(?,?,?,?,NULL,'quarantined',?,?)
         ON CONFLICT(server_id, kind, name) DO UPDATE SET fingerprint = excluded.fingerprint, exposed_fingerprint = NULL, state = 'quarantined', reason = excluded.reason, updated_at = excluded.updated_at`,
        row.id, kind, def.name, fp, live && live.state !== 'removed' ? 'changed' : 'new', now,
      );
    });
    if (live && live.state !== 'removed') appendLog('tool_change', `${kind} changed upstream: ${row.label}/${def.name} (${trigger})`, { from: live.fingerprint, to: fp }, row.id, Boolean(row.lab));
    this.evaluateVersion(row, kind, def.name, fp, { prevExposed, isBaseline });
    return true;
  }

  private auditBase(row: ServerRow, kind: DefinitionKind, def: Definition) {
    const prev = this.previousSealed(row.id, kind, def.name, fingerprintDefinition(kind, def));
    const otherTools = all<{ label: string; name: string }>("SELECT s.label AS label, l.name AS name FROM live l JOIN servers s ON s.id = l.server_id WHERE l.kind = 'tool' AND l.state != 'removed' AND l.server_id != ? AND s.lab = ?", row.id, row.lab).map((t) => ({ server: t.label, name: t.name }));
    return {
      kind,
      definition: def,
      previous: prev,
      serverName: row.label,
      declaredServerName: row.declared_name,
      declaredServerVersion: row.declared_version,
      artifactId: row.artifact_id,
      transport: row.transport,
      manifestRoot: row.manifest_root,
      otherTools,
      lab: Boolean(row.lab),
      serverId: row.id,
      privateSeal: Boolean(row.private),
    };
  }

  private previousSealed(serverId: string, kind: DefinitionKind, name: string, excludeFp: string) {
    const r = get<{ fingerprint: string; definition: string }>(
      `SELECT v.fingerprint, v.definition FROM versions v JOIN seals s ON s.fingerprint = v.fingerprint
       WHERE v.server_id = ? AND v.kind = ? AND v.name = ? AND v.fingerprint != ? AND s.verdict IN ('sealed','sealed_with_warnings') AND s.status IN ('active','superseded')
       ORDER BY v.first_seen DESC LIMIT 1`,
      serverId, kind, name, excludeFp,
    );
    return r ? { fingerprint: r.fingerprint, definition: json<Definition>(r.definition, { name }) } : null;
  }

  definitionOf(serverId: string, kind: DefinitionKind, fp: string): Definition | null {
    const r = get<{ definition: string }>('SELECT definition FROM versions WHERE server_id = ? AND kind = ? AND fingerprint = ?', serverId, kind, fp);
    return r ? json<Definition | null>(r.definition, null) : null;
  }

  liveRows(serverId: string) {
    return all<LiveRow>('SELECT * FROM live WHERE server_id = ?', serverId);
  }

  /** Decide what happens to a live version: release, hold for a human, block, or queue an audit. */
  evaluateVersion(row: ServerRow, kind: DefinitionKind, name: string, fp: string, ctx: { prevExposed: string | null; isBaseline: boolean }) {
    const seal = get<SealRowLite>('SELECT * FROM seals WHERE fingerprint = ?', fp);
    const def = this.definitionOf(row.id, kind, fp);
    if (!def) return;
    if (row.sealed_artifact_id && row.artifact_id && row.sealed_artifact_id !== row.artifact_id) {
      run("UPDATE live SET state = 'quarantined', reason = 'artifact_changed', exposed_fingerprint = NULL WHERE server_id = ? AND kind = ? AND name = ?", row.id, kind, name);
      return;
    }
    const verdict = seal?.verdict;
    const valid = seal && (seal.status === 'active' || seal.status === 'superseded') && seal.expires_at > Date.now();
    if (valid && (verdict === 'sealed' || verdict === 'sealed_with_warnings')) {
      const pkg = latestPackage(fp);
      this.applyRelease(row, kind, name, fp, (pkg?.changeClass ?? 'new') as ChangeClass, verdict, ctx.isBaseline);
      return;
    }
    if (seal && (verdict === 'unsafe' || seal.status === 'revoked')) {
      run("UPDATE live SET state = 'blocked', reason = ?, exposed_fingerprint = NULL, updated_at = ? WHERE server_id = ? AND kind = ? AND name = ?", seal.status === 'revoked' ? 'revoked' : 'unsafe', Date.now(), row.id, kind, name);
      return;
    }
    if (seal && verdict === 'pending' && seal.status === 'active') {
      // Sentinel never guesses "sealed": a pending verdict stays quarantined until re-audited or released by a person.
      run("UPDATE live SET state = 'quarantined', reason = 'pending verdict', exposed_fingerprint = NULL, updated_at = ? WHERE server_id = ? AND kind = ? AND name = ?", Date.now(), row.id, kind, name);
    } else {
      requestAudit({ ...this.auditBase(row, kind, def), trigger: ctx.prevExposed ? 'definition_changed' : 'first_seen', source: 'gateway', detonate: this.detonators.get(row.label) ?? null, force: seal?.status === 'expired' });
    }
    if (ctx.prevExposed) {
      // Informational until the verdict says otherwise: honest updates must not be a nuisance (J3).
      raiseIncident({
        type: 'tool_changed',
        severity: 'info',
        title: `${kind === 'tool' ? 'Tool' : kind === 'prompt' ? 'Prompt' : 'Resource template'} “${name}” on ${row.name} changed`,
        summary: `A sealed ${kind.replace('_', ' ')} published a new version. The new text was not shown to any agent; the ${kind.replace('_', ' ')} is quarantined while Sentinel audits it.`,
        groupKey: `version:${row.id}:${kind}:${name}:${fp}`,
        serverId: row.id,
        tool: name,
        fingerprint: fp,
        evidence: { previousFingerprint: ctx.prevExposed, fingerprint: fp, kind },
        lab: Boolean(row.lab),
      });
    }
  }

  private applyRelease(row: ServerRow, kind: DefinitionKind, name: string, fp: string, changeClass: ChangeClass, verdict: string, isBaseline: boolean) {
    const policy = policyFor(Boolean(row.lab));
    let auto: 'auto' | 'ask';
    if (isBaseline || changeClass === 'new') auto = verdict === 'sealed' || policy.profile === 'lab' ? 'auto' : 'ask';
    else if (changeClass === 'capability_expansion' || changeClass === 'suspicious') auto = 'ask';
    else if (verdict === 'sealed_with_warnings' && policy.profile !== 'lab') auto = 'ask';
    else auto = autoReleaseFor(policy, changeClass);
    if (auto === 'auto') {
      this.release(row.id, kind, name, fp, isBaseline ? 'sealed (baseline)' : `sealed; ${changeClass} change auto-released`);
      return;
    }
    run("UPDATE live SET state = 'awaiting_release', reason = ?, exposed_fingerprint = NULL, updated_at = ? WHERE server_id = ? AND kind = ? AND name = ? AND fingerprint = ?", `${verdict}; ${changeClass} change needs a human decision`, Date.now(), row.id, kind, name, fp);
    const needsSeal = changeClass === 'capability_expansion' && humanSealRequiredFor(policy, 'capability_expansion_release');
    const inc = isBaseline
      ? get<{ id: string }>("SELECT id FROM incidents WHERE group_key = ? AND status IN ('open','acknowledged')", `version:${row.id}:${kind}:${name}:${fp}`)
      : raiseIncident({
          type: 'tool_changed', severity: 'medium', title: `“${name}” on ${row.name} changed and needs your decision`,
          summary: `Sentinel: ${verdict.replace(/_/g, ' ')}; change class: ${changeClass.replace(/_/g, ' ')}. The new version stays unavailable until you release it.`,
          groupKey: `version:${row.id}:${kind}:${name}:${fp}`, serverId: row.id, tool: name, fingerprint: fp, lab: Boolean(row.lab),
        });
    createApproval({
      kind: 'release',
      digest: actionDigest({ kind: 'release', requestId: fp, server: row.label, tool: name, fingerprint: fp }),
      action: { serverId: row.id, kind, name, fingerprint: fp },
      summary: `Release ${kind.replace('_', ' ')} “${name}” (${row.name})`,
      reason: `Sentinel: ${verdict.replace(/_/g, ' ')}. Change class: ${changeClass.replace(/_/g, ' ')}. Policy requires a human decision before agents can use this version.`,
      humanSeal: needsSeal,
      serverId: row.id,
      tool: name,
      fingerprint: fp,
      incidentId: inc?.id ?? null,
      lab: Boolean(row.lab),
      windowSec: 7 * 86_400,
    });
  }

  release(serverId: string, kind: DefinitionKind, name: string, fp: string, note: string) {
    const r = run("UPDATE live SET state = 'released', reason = ?, exposed_fingerprint = fingerprint, updated_at = ? WHERE server_id = ? AND kind = ? AND name = ? AND fingerprint = ?", note, Date.now(), serverId, kind, name, fp);
    if (!r.changes) return 'the live version changed again before release; nothing released';
    const row = this.serverRow(serverId)!;
    if (!row.sealed_artifact_id && row.artifact_id) run('UPDATE servers SET sealed_artifact_id = ? WHERE id = ?', row.artifact_id, serverId);
    appendLog('tool_change', `Released ${row.label}/${name} (${note})`, { fingerprint: fp }, serverId, Boolean(row.lab));
    const inc = get<{ id: string; severity: string }>("SELECT id, severity FROM incidents WHERE group_key = ? AND status IN ('open','acknowledged')", `version:${serverId}:${kind}:${name}:${fp}`);
    if (inc) {
      addIncidentEvent(inc.id, 'released', `New version sealed and released (${note})`);
      if (inc.severity === 'info' || inc.severity === 'low' || inc.severity === 'medium') setIncidentStatus(inc.id, 'resolved', `New version sealed and released (${note})`, 'zoro');
    }
    this.scheduleNotify([kind]);
    bus.emitEvent('tool', { serverId, name, state: 'released' });
    return 'released';
  }

  reaudit(serverId: string, kind: DefinitionKind, name: string) {
    const row = this.serverRow(serverId);
    const live = get<LiveRow>('SELECT * FROM live WHERE server_id = ? AND kind = ? AND name = ?', serverId, kind, name);
    if (!row || !live) throw new Error('not found');
    const def = this.definitionOf(serverId, kind, live.fingerprint);
    if (!def) throw new Error('definition not found');
    return requestAudit({ ...this.auditBase(row, kind, def), trigger: 'manual_reaudit', source: 'reaudit', force: true, detonate: this.detonators.get(row.label) ?? null });
  }

  /** A quarantined version may be released by a verified human while its verdict is pending (§11.9). */
  requestHumanRelease(serverId: string, kind: DefinitionKind, name: string) {
    const row = this.serverRow(serverId);
    const live = get<LiveRow>('SELECT * FROM live WHERE server_id = ? AND kind = ? AND name = ?', serverId, kind, name);
    if (!row || !live) throw new Error('not found');
    const seal = get<SealRowLite>('SELECT * FROM seals WHERE fingerprint = ?', live.fingerprint);
    if (seal && (seal.verdict === 'unsafe' || seal.status === 'revoked')) throw new Error('Unsafe or revoked versions cannot be released; only a single call can be overridden with a Human Seal.');
    return createApproval({
      kind: 'release',
      digest: actionDigest({ kind: 'release', requestId: `human:${live.fingerprint}`, server: row.label, tool: name, fingerprint: live.fingerprint }),
      action: { serverId, kind, name, fingerprint: live.fingerprint },
      summary: `Release unsealed ${kind.replace('_', ' ')} “${name}” (${row.name}) before its verdict`,
      reason: seal?.verdict === 'pending' ? 'Sentinel could not reach a verdict. A verified person may release this exact version.' : 'This version is not sealed yet. A verified person may release this exact version.',
      humanSeal: true,
      serverId,
      tool: name,
      fingerprint: live.fingerprint,
      lab: Boolean(row.lab),
    });
  }

  /** Keep a quarantined version blocked permanently (explicit human choice). */
  keepBlocked(serverId: string, kind: DefinitionKind, name: string) {
    run("UPDATE live SET state = 'blocked', reason = 'kept blocked by user', exposed_fingerprint = NULL, updated_at = ? WHERE server_id = ? AND kind = ? AND name = ?", Date.now(), serverId, kind, name);
    appendLog('tool_change', `Kept blocked: ${name}`, null, serverId);
    this.scheduleNotify([kind]);
  }

  private onVerdict(fp: string, pkg: VerdictPackage) {
    const rows = all<LiveRow & { label: string; sname: string; lab: number }>('SELECT l.*, s.label AS label, s.name AS sname, s.lab AS lab FROM live l JOIN servers s ON s.id = l.server_id WHERE l.fingerprint = ?', fp);
    for (const l of rows) {
      const row = this.serverRow(l.server_id);
      if (!row) continue;
      const wasExposedBefore = Boolean(get('SELECT 1 FROM versions WHERE server_id = ? AND kind = ? AND name = ? AND fingerprint != ?', l.server_id, l.kind, l.name, fp));
      if (pkg.verdict === 'unsafe') {
        run("UPDATE live SET state = 'blocked', reason = 'unsafe', exposed_fingerprint = NULL, updated_at = ? WHERE server_id = ? AND kind = ? AND name = ?", Date.now(), l.server_id, l.kind, l.name);
        const top = [...pkg.findings].sort((a, b) => ['info', 'low', 'medium', 'high', 'critical'].indexOf(b.severity) - ['info', 'low', 'medium', 'high', 'critical'].indexOf(a.severity))[0];
        raiseIncident({
          type: wasExposedBefore ? 'tool_changed' : 'unsafe_verdict',
          severity: 'critical',
          title: wasExposedBefore ? `“${l.name}” on ${l.sname} changed: ${top?.title ?? 'unsafe'}` : `“${l.name}” on ${l.sname} is unsafe: ${top?.title ?? 'see findings'}`,
          summary: pkg.aiSummary ?? top?.explanation ?? 'Sentinel found a critical or high-severity issue.',
          groupKey: `version:${l.server_id}:${l.kind}:${l.name}:${fp}`,
          serverId: l.server_id,
          tool: l.name,
          fingerprint: fp,
          evidence: { fingerprint: fp, previousFingerprint: pkg.previousFingerprint, verdict: pkg.verdict, findings: pkg.findings.length, changeClass: pkg.changeClass },
          lab: Boolean(l.lab),
          eventMessage: `Sentinel verdict: unsafe (risk ${pkg.riskScore})`,
        });
      } else {
        const inc = get<{ id: string }>("SELECT id FROM incidents WHERE group_key = ? AND status IN ('open','acknowledged')", `version:${l.server_id}:${l.kind}:${l.name}:${fp}`);
        if (inc) addIncidentEvent(inc.id, 'verdict', `Sentinel verdict: ${pkg.verdict.replace(/_/g, ' ')}${pkg.pendingReason ? ` — ${pkg.pendingReason}` : ''}`);
        this.evaluateVersion(row, l.kind, l.name, fp, { prevExposed: null, isBaseline: !wasExposedBefore });
      }
      this.scheduleNotify([l.kind]);
    }
  }

  /** Revocation (§4.18): block everywhere immediately and produce a local exposure report. */
  revoke(fp: string, reason: string, source: 'local' | 'ledger' | 'dispute') {
    const seal = get<{ status: string; name: string; server_label: string; lab: number }>('SELECT status, name, server_label, lab FROM seals WHERE fingerprint = ?', fp);
    if (!seal || seal.status === 'revoked') return;
    run("UPDATE seals SET status = 'revoked', revoked_at = ?, revoke_reason = ? WHERE fingerprint = ?", Date.now(), reason, fp);
    appendLog('revocation', `Seal revoked (${source}): ${seal.server_label}/${seal.name}`, { reason }, fp, Boolean(seal.lab));
    if (source !== 'ledger') publishRevocation(fp, reason);
    const live = all<LiveRow>('SELECT * FROM live WHERE fingerprint = ?', fp);
    for (const l of live) run("UPDATE live SET state = 'blocked', reason = 'revoked', exposed_fingerprint = NULL, updated_at = ? WHERE server_id = ? AND kind = ? AND name = ?", Date.now(), l.server_id, l.kind, l.name);
    const exposure = all<{ id: string; ts: number; agent: string; tool: string }>("SELECT id, ts, agent, tool FROM calls WHERE fingerprint = ? AND decision = 'allow' ORDER BY ts", fp);
    if (exposure.length || live.length)
      raiseIncident({
        type: 'revocation',
        severity: 'critical',
        title: `A tool version you ${exposure.length ? 'used' : 'have installed'} was revoked: ${seal.name}`,
        summary: `${reason} ${exposure.length} call(s) were made while it was trusted${exposure.length ? `, between ${new Date(exposure[0].ts).toLocaleString()} and ${new Date(exposure[exposure.length - 1].ts).toLocaleString()}` : ''}. The exposure report lists them; it was generated on this machine and nothing was sent anywhere.`,
        groupKey: `revocation:${fp}`,
        serverId: live[0]?.server_id ?? null,
        tool: seal.name,
        fingerprint: fp,
        evidence: { fingerprint: fp, reason, source, exposedCalls: exposure.map((c) => c.id) },
        lab: Boolean(seal.lab),
      });
    this.scheduleNotify(['tool', 'prompt', 'resource_template']);
    bus.emitEvent('seal', { fingerprint: fp, status: 'revoked' });
  }

  private detectFlapping(row: ServerRow) {
    const n = get<{ n: number }>('SELECT COUNT(*) AS n FROM versions WHERE server_id = ? AND first_seen > ?', row.id, Date.now() - 10 * 60_000)?.n ?? 0;
    const tools = get<{ n: number }>("SELECT COUNT(*) AS n FROM live WHERE server_id = ? AND state != 'removed'", row.id)?.n ?? 0;
    if (n > Math.max(6, tools * 2) && row.created_at < Date.now() - 10 * 60_000) {
      run('UPDATE servers SET unstable = 1, flap_count = flap_count + 1 WHERE id = ?', row.id);
      raiseIncident({ type: 'flapping', severity: 'medium', title: `${row.name} keeps changing its definitions`, summary: `${n} new definition versions in 10 minutes. Every variant still needs a seal; the server is labeled as an unstable manifest.`, groupKey: `flap:${row.id}`, serverId: row.id, lab: Boolean(row.lab) });
    }
  }

  /** Shadowing and collision radar across all of the user's servers (§5.8, FR-D4). */
  collisionRadar() {
    const rows = all<{ name: string; label: string; server_id: string; sname: string; lab: number }>("SELECT l.name, s.label, l.server_id, s.name AS sname, s.lab FROM live l JOIN servers s ON s.id = l.server_id WHERE l.kind = 'tool' AND l.state != 'removed'");
    const byName = new Map<string, typeof rows>();
    // Lab and real servers are compared only among themselves.
    for (const r of rows) byName.set(`${r.lab}:${r.name}`, [...(byName.get(`${r.lab}:${r.name}`) ?? []), r]);
    for (const [key, list] of byName) {
      const name = key.slice(key.indexOf(':') + 1);
      const servers = [...new Set(list.map((l) => l.server_id))];
      if (servers.length < 2) continue;
      raiseIncident({ type: 'shadowing', severity: 'medium', title: `Tool name “${name}” is offered by ${servers.length} servers`, summary: `${list.map((l) => l.sname).join(' and ')} both offer “${name}”. Zoro presents them under namespaced names so the agent cannot confuse them; collisions are a known shadowing technique.`, groupKey: `collision:${name}:${servers.sort().join(',')}`, tool: name, evidence: { servers: list.map((l) => l.label) }, lab: list.every((l) => l.lab === 1) });
    }
  }

  // --- What agents see ---

  /** Lab sessions see only Lab servers and real sessions only real servers: the two never mix (§4.20). */
  exposed(kind: DefinitionKind, lab: boolean): ExposedEntry[] {
    const rows = all<LiveRow & { label: string; mode: string; lab: number }>(
      `SELECT l.*, s.label AS label, s.mode AS mode, s.lab AS lab FROM live l JOIN servers s ON s.id = l.server_id
       WHERE l.kind = ? AND l.state = 'released' AND l.exposed_fingerprint IS NOT NULL AND l.exposed_fingerprint = l.fingerprint AND s.mode != 'disabled' AND s.lab = ?`,
      kind,
      lab,
    );
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
    const out: ExposedEntry[] = [];
    for (const r of rows) {
      const def = this.definitionOf(r.server_id, kind, r.exposed_fingerprint!);
      if (!def) continue;
      const exposedName = (counts.get(r.name) ?? 0) > 1 ? `${r.label}__${r.name}` : r.name;
      out.push({ exposedName, serverId: r.server_id, label: r.label, kind, name: r.name, fingerprint: r.exposed_fingerprint!, definition: exposedName === r.name ? def : { ...def, name: exposedName } });
    }
    return out;
  }

  /** Seal state used by the policy engine for one call (§4.4 steps 2–4). */
  sealStateFor(serverId: string, kind: DefinitionKind, name: string): CallSealState {
    const live = get<LiveRow>('SELECT * FROM live WHERE server_id = ? AND kind = ? AND name = ?', serverId, kind, name) ?? null;
    const row = this.serverRow(serverId);
    if (!live || !row) return { state: 'unknown', fingerprint: null, changeClass: null, registry: 'not_configured', highImpact: false, capabilities: [], live };
    const seal = get<SealRowLite>('SELECT * FROM seals WHERE fingerprint = ?', live.fingerprint);
    const pkg = seal ? latestPackage(live.fingerprint) : null;
    const def = this.definitionOf(serverId, kind, live.fingerprint);
    const capabilities = (pkg?.capabilityProfile ?? (def ? inferCapabilities(def) : [])).map((c) => c.capability);
    const highImpact = capabilities.some((c) => HIGH_IMPACT.has(c));
    const base = { fingerprint: live.fingerprint, changeClass: (pkg?.changeClass ?? null) as ChangeClass | null, highImpact, capabilities, live };
    let registry: RegistryState = 'not_configured';
    if (isEnsConfigured() && seal && !seal.lab) {
      const check = json<{ ok: boolean; error?: string; lastOkAt?: number } | null>(seal.ens_check, null);
      if (seal.ens_status !== 'written') registry = 'pending';
      else if (check?.ok && seal.ens_checked_at && Date.now() - seal.ens_checked_at < config.ens.cacheTtlSec * 2000) registry = 'confirmed';
      else if (check?.error) registry = check.lastOkAt && Date.now() - check.lastOkAt < config.ens.cacheTtlSec * 1000 ? 'unreachable_cached' : 'unreachable_stale';
      else registry = 'pending';
      if (check && check.ok === false && !check.error) return { ...base, state: 'contradiction', registry, detail: 'registry records do not match the local verdict' };
    }
    if (row.sealed_artifact_id && row.artifact_id && row.sealed_artifact_id !== row.artifact_id) return { ...base, state: 'artifact_mismatch', registry };
    if (!seal) return { ...base, state: get("SELECT 1 FROM audits WHERE fingerprint = ? AND status IN ('queued','running')", live.fingerprint) ? 'pending' : 'unknown', registry };
    const ledgerRevoked = get("SELECT 1 FROM public_events WHERE fp = ? AND type = 'seal.revoked' AND valid = 1", live.fingerprint);
    if (seal.status === 'revoked') return { ...base, state: 'revoked', registry };
    if (ledgerRevoked) return { ...base, state: 'contradiction', registry, detail: 'the ledger records a revocation that the local seal does not reflect' };
    if (seal.verdict === 'unsafe') return { ...base, state: 'unsafe', registry };
    if (seal.verdict === 'pending') return { ...base, state: 'pending', registry, detail: pkg?.pendingReason ?? undefined };
    if (seal.status === 'expired' || seal.expires_at < Date.now()) return { ...base, state: 'expired', registry };
    if (live.state === 'awaiting_release') return { ...base, state: 'pending', registry, detail: 'sealed, waiting for a human release decision' };
    if (live.state !== 'released') return { ...base, state: 'pending', registry, detail: live.reason ?? undefined };
    return { ...base, state: seal.verdict as 'sealed' | 'sealed_with_warnings', registry };
  }

  /** Find a target by the name the agent used, including quarantined tools it may remember from earlier turns. */
  resolveName(exposedName: string, lab: boolean): { serverId: string; name: string } | null {
    const ns = exposedName.match(/^([a-z0-9-]+)__(.+)$/);
    if (ns) {
      const s = get<{ id: string }>('SELECT id FROM servers WHERE label = ? AND lab = ?', ns[1], lab);
      if (s) return { serverId: s.id, name: ns[2] };
    }
    const rows = all<{ server_id: string; state: string }>("SELECT l.server_id, l.state FROM live l JOIN servers s ON s.id = l.server_id WHERE l.kind = 'tool' AND l.name = ? AND l.state != 'removed' AND s.lab = ?", exposedName, lab);
    if (rows.length === 1) return { serverId: rows[0].server_id, name: exposedName };
    const released = rows.filter((r) => r.state === 'released');
    if (released.length === 1) return { serverId: released[0].server_id, name: exposedName };
    return rows[0] ? { serverId: rows[0].server_id, name: exposedName } : null;
  }

  scheduleNotify(kinds: DefinitionKind[]) {
    kinds.forEach((k) => this.pendingKinds.add(k));
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      const ks = [...this.pendingKinds];
      this.pendingKinds.clear();
      for (const s of this.sessions) s.notifyListChanged(ks.length ? ks : ['tool']);
    }, 100);
  }
}

export const gateway = new Gateway();
