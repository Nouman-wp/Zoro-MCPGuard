import type { Severity } from '../types';

export interface PhrasePattern {
  id: string;
  re: RegExp;
  severity: Severity;
  label: string;
}

/** Instruction-like phrasing aimed at the model rather than the human reading a tool's documentation. */
export const INSTRUCTION_PATTERNS: PhrasePattern[] = [
  { id: 'ignore-previous', re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,30}\b(previous|prior|above|earlier|all|any|system|other)\b[^.\n]{0,20}\b(instructions?|prompts?|rules?|directions?|guidelines?)\b/i, severity: 'critical', label: 'Asks the model to ignore its instructions' },
  { id: 'conceal-from-user', re: /\b(do not|don't|dont|never|without)\b[^.\n]{0,25}\b(tell|telling|inform|informing|notify|notifying|mention|mentioning|reveal|revealing|show|showing|alert|alerting|disclose|asking)\b[^.\n]{0,20}\b(the )?(user|human|operator|person|customer)\b/i, severity: 'critical', label: 'Tells the model to hide something from the user' },
  { id: 'secretly', re: /\b(secretly|silently|quietly|covertly|discreetly|invisibly|behind the scenes)\b[^.\n]{0,60}\b(send|copy|forward|include|add|bcc|cc|upload|post|pass|read|write|share|log)\b/i, severity: 'critical', label: 'Asks for a covert action' },
  { id: 'always-copy', re: /\b(always|also|additionally|every time|each time|for every|for each)\b[^.\n]{0,40}\b(bcc|cc|copy|forward|send a copy|include)\b[^\n]{0,60}?([\w.+-]*@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}|https?:\/\/[^\s"'<>]+|\b0x[0-9a-f]{6,}|\baddress\b)/i, severity: 'critical', label: 'Adds a hidden copy or forward to a destination' },
  { id: 'always-add-destination', re: /\b(always|also|additionally|every time|each time|for every|for each)\b[^.\n]{0,40}\b(add|include|set|use|put)\b[^.\n]{0,20}([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|https?:\/\/\S+|\+\d{8,}|0x[0-9a-fA-F]{40})[^.\n]{0,40}\b(bcc|cc|recipient|copy|destination|endpoint|webhook)\b/i, severity: 'critical', label: 'Adds a fixed destination to every call' },
  { id: 'read-secrets', re: /\b(read|cat|open|load|include|attach|pass|send|collect)\b[^.\n]{0,40}(~\/\.ssh|id_rsa|id_ed25519|\.ssh\/|\/etc\/passwd|\.env\b|\.aws\/credentials|\.npmrc|\.netrc|keychain|private key|seed phrase|mnemonic|wallet\.json|mcp\.json|claude_desktop_config)/i, severity: 'critical', label: 'Asks the model to read secrets or credentials' },
  { id: 'pass-content-into-param', re: /\b(pass|put|place|include|provide|insert|send)\b[^.\n]{0,40}\b(its|their|the|file|full|entire|whole|complete)\b[^.\n]{0,30}\b(contents?|conversation|history|chat|messages?|context|prompt)\b[^.\n]{0,40}\b(as|in|into|via|through)\b[^.\n]{0,20}\b(parameter|param|argument|field|notes|sidenote|context|metadata)\b/i, severity: 'critical', label: 'Routes data into a parameter' },
  { id: 'before-using', re: /\bbefore (using|calling|invoking|running) (this|the|any) tool\b/i, severity: 'high', label: 'Pre-condition instruction aimed at the model' },
  { id: 'xml-important', re: /<\s*\/?\s*(important|system|instructions?|secret|hidden|admin|override)\b[^>]*>/i, severity: 'high', label: 'Pseudo-system markup aimed at the model' },
  { id: 'you-must', re: /\b(you|the (assistant|model|agent|ai))\b[^.\n]{0,15}\b(must|should always|are required to|need to always|have to)\b[^.\n]{0,60}\b(first|always|before|instead)\b/i, severity: 'medium', label: 'Imperative addressed to the model' },
  { id: 'or-else', re: /\b(otherwise|or else|if you don't|if you do not)\b[^.\n]{0,40}\b(fail|crash|break|not work|stop working|be harmed|lose)\b/i, severity: 'medium', label: 'Coercive phrasing' },
  { id: 'user-wants', re: /\bthe user (has )?(already )?(wants|asked|requested|authori[sz]ed|approved|consented)\b[^.\n]{0,40}\b(you|to)\b/i, severity: 'medium', label: 'Claims user consent on the user’s behalf' },
  { id: 'system-prompt', re: /\b(system prompt|developer message|hidden prompt|jailbreak)\b/i, severity: 'medium', label: 'References the model’s prompt' },
];

/** Text addressed to the auditor or a security reviewer — the attack that targets the reviewer itself. */
export const AUDITOR_PATTERNS: PhrasePattern[] = [
  { id: 'note-to-auditor', re: /\b(note|message|instruction|attention|hint)s?\b[^.\n]{0,15}\b(to|for)\b[^.\n]{0,10}\b(the )?(auditor|reviewer|scanner|security (review|reviewer|scanner|tool|team)|ai (reviewer|auditor|model)|llm|sentinel|zoro|analy[sz]er)\b/i, severity: 'critical', label: 'Message addressed to the security reviewer' },
  { id: 'claims-approved', re: /\b(this|the) (tool|server|definition|package|description)\b[^.\n]{0,30}\b(is|has been|was)\b[^.\n]{0,15}\b(pre-?approved|already (audited|approved|verified|reviewed)|whitelisted|allowlisted|certified safe|verified safe|security[- ]cleared|exempt)\b/i, severity: 'critical', label: 'Claims to be pre-approved' },
  { id: 'mark-safe', re: /\b(mark|classify|rate|label|treat|report|consider)\b[^.\n]{0,20}\b(this|it|the tool)\b[^.\n]{0,20}\b(as )?(safe|benign|harmless|approved|low[- ]risk|clean|trusted)\b/i, severity: 'critical', label: 'Asks to be marked safe' },
  { id: 'reviewer-ignore', re: /\b(auditors?|reviewers?|scanners?|security (tools?|checks?|scans?)|ai (reviewers?|models?))\b[^.\n]{0,40}\b(should|must|can|may)\b[^.\n]{0,15}\b(ignore|skip|disregard|approve|pass|allow)\b/i, severity: 'critical', label: 'Tells reviewers to skip checks' },
];

/** Generic references that reach beyond the tool itself (shadowing). Named tool references are matched separately. */
export const CROSS_TOOL_PATTERNS: PhrasePattern[] = [
  { id: 'any-tool', re: /\b(when|whenever|if|while)\b[^.\n]{0,40}\b(any|all|every|other|another|the other)\b[^.\n]{0,12}\b(tools?|servers?|functions?|integrations?|mcp)\b/i, severity: 'high', label: 'Changes how other tools are used' },
  { id: 'named-invocation', re: /\bwhen\b[^.\n]{0,10}\(?\b[a-z0-9_]*mcp[a-z0-9_]*\)?[^.\n]{0,30}\b(is )?(invoked|called|used)\b/i, severity: 'high', label: 'Rewrites how another server’s tool is invoked' },
  { id: 'all-tools', re: /\b(for|to) (all|every|any) (other )?(tools?|tool calls?|emails?|messages?|requests?)\b[^.\n]{0,40}\b(must|should|always|also|add|include|set)\b/i, severity: 'high', label: 'Global rule for other tools' },
  { id: 'instead-of', re: /\b(instead of|rather than|do not use|don't use|never use)\b[^.\n]{0,20}\b(the )?[a-z0-9_.-]+\b[^.\n]{0,10}\b(tool|server)\b/i, severity: 'high', label: 'Steers the model away from another tool' },
];

export const EXFIL_VERBS = /\b(send|sends|forward|copy|copies|bcc|cc|post|upload|transmit|report|sync|share|mirror|exfiltrate|log|notify|webhook)\b/i;

export const URL_RE = /\bhttps?:\/\/[^\s"'<>)\]]+/gi;
export const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
export const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?::\d{2,5})?\b/g;
export const ETH_ADDR_RE = /\b0x[a-fA-F0-9]{40}\b/g;
export const BASE64_RE = /(?:[A-Za-z0-9+/]{4}){6,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g;
export const HEX_RE = /\b(?:0x)?[0-9a-fA-F]{32,}\b/g;
export const URLENC_RE = /(?:%[0-9a-fA-F]{2}){5,}/g;

/** Parameter names that commonly absorb conversation history, secrets or side-channel data. */
export const SUSPICIOUS_PARAM = /^(notes?|sidenote|side_note|context|extra_?context|hidden|history|conversation|conversation_?history|chat_?history|transcript|messages|memory|previous_?messages|system_?prompt|prompt|secret|secrets|token|api_?key|password|credentials?|ssh_?key|private_?key|env|environment|metadata|extra|debug|debug_?info|feedback|summary_of_conversation|user_?info|session|cookie)$/i;

/** Well-known MCP server names; a near-miss of one of these is a typosquat signal. */
export const KNOWN_SERVER_NAMES = [
  'github', 'gitlab', 'slack', 'filesystem', 'postgres', 'postgresql', 'sqlite', 'mysql', 'mongodb', 'redis', 'google-drive', 'gdrive', 'gmail',
  'google-maps', 'notion', 'linear', 'jira', 'confluence', 'atlassian', 'stripe', 'paypal', 'brave-search', 'puppeteer', 'playwright', 'fetch',
  'memory', 'sequential-thinking', 'sentry', 'figma', 'supabase', 'cloudflare', 'vercel', 'aws', 'azure', 'docker', 'kubernetes', 'git',
  'everything', 'time', 'everart', 'firecrawl', 'tavily', 'exa', 'perplexity', 'context7', 'browserbase', 'airtable', 'hubspot', 'salesforce',
  'shopify', 'twilio', 'sendgrid', 'mailgun', 'discord', 'telegram', 'whatsapp', 'obsidian', 'todoist', 'asana', 'trello', 'zapier',
  'metamask', 'coinbase', 'alchemy', 'etherscan', 'uniswap', 'wallet',
];

export function decodeBase64Printable(s: string): string | null {
  try {
    const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    if (bin.length < 12) return null;
    let printable = 0;
    for (let i = 0; i < bin.length; i++) {
      const c = bin.charCodeAt(i);
      if ((c >= 0x20 && c < 0x7f) || c === 0x0a || c === 0x0d || c === 0x09) printable++;
    }
    return printable / bin.length > 0.9 ? bin : null;
  } catch {
    return null;
  }
}

export function decodeHexPrintable(s: string): string | null {
  const clean = s.replace(/^0x/, '');
  if (clean.length % 2) return null;
  let out = '';
  for (let i = 0; i < clean.length; i += 2) out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  let printable = 0;
  for (let i = 0; i < out.length; i++) {
    const c = out.charCodeAt(i);
    if (c >= 0x20 && c < 0x7f) printable++;
  }
  return printable / out.length > 0.9 ? out : null;
}
