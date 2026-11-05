import { irreversibleSignals } from '../irreversible';
import type { Capability, CapabilityEvidence, Definition, SinkType, SourceLabel } from '../types';

interface CapRule {
  capability: Capability;
  /** matched against "name + title + description" */
  text?: RegExp[];
  /** matched against input schema property names */
  params?: RegExp;
}

const RULES: CapRule[] = [
  {
    capability: 'read_local_files',
    text: [/\b(read|open|load|cat|view|list|get)\w*\b[^.]{0,40}\b(files?|director(y|ies)|folders?|paths?|disk)\b/i, /\bfile ?system\b/i],
    params: /^(path|paths|file|files|file_?path|filename|dir|directory|folder|root)$/i,
  },
  {
    capability: 'write_local_files',
    text: [/\b(write|save|create|delete|remove|move|rename|edit|overwrite|append|modify)\w*\b[^.]{0,40}\b(files?|director(y|ies)|folders?|paths?)\b/i],
    params: /^(content|contents|new_?content|data_to_write|destination|dest)$/i,
  },
  {
    capability: 'network_egress',
    text: [/\b(fetch|http|https|request|download|upload|browse|scrape|crawl|webhook|api call|post to)\b/i],
    params: /^(url|uri|urls|endpoint|webhook|webhook_?url|href|link|host|callback(_?url)?)$/i,
  },
  {
    capability: 'send_communication',
    text: [/\b(send|sends|sending|reply|forward|post|publish|tweet|notify|message|messages|email|e-mail|mail|sms|dm|slack|telegram|whatsapp)\b/i],
    params: /^(to|recipient|recipients|cc|bcc|channel|chat_?id|phone|phone_?number|email|subject)$/i,
  },
  {
    capability: 'financial_action',
    text: [/\b(pay|payment|payments|transfer|refund|charge|invoice|withdraw|deposit|payout|purchase|buy|sell|swap)\b/i],
    params: /^(amount|value|currency|price|quantity|iban|account_?number|card)$/i,
  },
  {
    capability: 'transaction_signing',
    text: [/\b(sign|signature|transaction|tx|wallet|calldata|private key|broadcast|on-?chain|erc-?20|token transfer)\b/i],
    params: /^(tx|transaction|calldata|data|nonce|gas|gas_?limit|chain_?id|signature|wallet)$/i,
  },
  {
    capability: 'code_execution',
    text: [/\b(execute|exec|run|eval|evaluate|shell|bash|command|terminal|script|interpreter|spawn)\b/i],
    params: /^(command|cmd|code|script|shell|program|expression)$/i,
  },
  {
    capability: 'credential_access',
    text: [/\b(credentials?|passwords?|secrets?|tokens?|api[ _-]?keys?|keychain|ssh|id_rsa|\.env|private keys?|vault)\b/i],
    params: /^(password|secret|token|api_?key|credentials?|private_?key|ssh_?key)$/i,
  },
  {
    capability: 'database_read',
    text: [/\b(query|select|sql|database|db|table|rows|records|collection)\b/i],
    params: /^(query|sql|table|collection|database)$/i,
  },
  {
    capability: 'database_write',
    text: [/\b(insert|update|upsert|delete|drop|truncate|alter|write)\b[^.]{0,30}\b(rows?|records?|tables?|database|db|collection)\b/i],
  },
  {
    capability: 'external_content_ingestion',
    text: [
      /\b(fetch|browse|scrape|crawl|search the web|web search|read (an? )?(web ?page|url|email|inbox|message)|inbox|incoming|issues?|comments?|rss|feed|tweets?|posts? from)\b/i,
    ],
    params: /^(url|uri|query|search|inbox|mailbox|feed)$/i,
  },
];

const schemaProps = (schema: unknown): { name: string; description: string }[] => {
  const out: { name: string; description: string }[] = [];
  const visit = (s: unknown, depth: number) => {
    if (!s || typeof s !== 'object' || depth > 6) return;
    const props = (s as { properties?: Record<string, unknown> }).properties;
    if (props && typeof props === 'object') {
      for (const [name, p] of Object.entries(props)) {
        const description = typeof (p as { description?: unknown })?.description === 'string' ? (p as { description: string }).description : '';
        out.push({ name, description });
        visit(p, depth + 1);
      }
    }
    const items = (s as { items?: unknown }).items;
    if (items) visit(items, depth + 1);
  };
  visit(schema, 0);
  return out;
};

export function inferCapabilities(def: Definition): CapabilityEvidence[] {
  const name = String(def.name ?? '');
  const humanName = name.replace(/[_-]+/g, ' ');
  const text = [humanName, def.title, def.description].filter((x) => typeof x === 'string').join(' . ');
  const props = schemaProps(def.inputSchema);
  const propText = props.map((p) => p.description).join(' . ');
  const annotations = (def.annotations ?? {}) as Record<string, unknown>;
  const found = new Map<Capability, Set<string>>();
  const add = (c: Capability, s: string) => {
    if (!found.has(c)) found.set(c, new Set());
    found.get(c)!.add(s);
  };
  for (const rule of RULES) {
    for (const re of rule.text ?? []) {
      const m = text.match(re) ?? propText.match(re);
      if (m) add(rule.capability, `text: “${m[0].trim().slice(0, 60)}”`);
    }
    if (rule.params) for (const p of props) if (rule.params.test(p.name)) add(rule.capability, `parameter: ${p.name}`);
  }
  // A bare "message"/"post" word in a read-only tool is not a send capability.
  if (annotations.readOnlyHint === true) {
    for (const c of ['write_local_files', 'send_communication', 'database_write', 'financial_action'] as Capability[]) {
      const sig = found.get(c);
      if (sig && [...sig].every((s) => s.startsWith('text:'))) found.delete(c);
    }
  }
  if (annotations.openWorldHint === true) add('network_egress', 'annotation: openWorldHint');
  if (annotations.destructiveHint === true) add('write_local_files', 'annotation: destructiveHint');
  // Signing requires more than the word "sign" in e.g. "sign up".
  const tx = found.get('transaction_signing');
  if (tx && tx.size === 1 && [...tx][0].includes('“sign')) found.delete('transaction_signing');
  // database_read from the word "query" alone in a search tool is too weak.
  const dbr = found.get('database_read');
  if (dbr && [...dbr].every((s) => /“(query|records?)”/i.test(s))) found.delete('database_read');
  // Undo-impossible brake: delete/drop/destroy/transfer/… in the name or first sentence, or a destructiveHint.
  for (const s of irreversibleSignals(def)) add('irreversible_action', s);
  return [...found.entries()].map(([capability, signals]) => ({ capability, signals: [...signals].slice(0, 5) }));
}

export const capabilitySet = (profile: CapabilityEvidence[]) => new Set(profile.map((c) => c.capability));

/** Data-flow labels (§4.10) derived from a capability profile. */
export function sourceLabel(caps: Set<Capability>): SourceLabel {
  if (caps.has('external_content_ingestion')) return 'untrusted_external';
  if (caps.has('read_local_files') || caps.has('database_read') || caps.has('credential_access')) return 'private_sensitive';
  return 'neutral';
}

export function sinkTypes(caps: Set<Capability>): SinkType[] {
  const out: SinkType[] = [];
  if (caps.has('send_communication')) out.push('external_communication');
  if (caps.has('network_egress')) out.push('external_network');
  if (caps.has('financial_action') || caps.has('transaction_signing')) out.push('financial_action');
  if (caps.has('code_execution')) out.push('code_execution');
  if (caps.has('write_local_files') || caps.has('database_write')) out.push('privileged_write');
  return out;
}

/** Purposes whose stated job never needs high-impact capabilities (used by the capability-mismatch rule). */
export const BENIGN_PURPOSE = /\b(weather|forecast|temperature|time ?zone|current time|clock|calculat|math|arithmetic|joke|quote of|greeting|hello|echo|random number|dice|unit conver|translate|spell|dictionary|define a word|horoscope|calendar date|uuid)\b/i;
