/**
 * Real incidents for the newspaper sequence, retold simply. Facts were checked against the cited sources (Nov 2026).
 * "What Zoro does" describes the class of attack Zoro guards against, and `limit` says plainly where Zoro would not
 * have helped. Research demonstrations are labelled as such.
 */

export interface Story {
  id: string;
  date: string;
  headline: string;
  deck: string;
  story: string;
  feature: string;
  zoro: string;
  limit?: string;
  source: string;
}

export const STORIES: Story[] = [
  {
    id: 'binance-2019',
    date: 'May 7, 2019',
    headline: 'Hackers walk out of Binance with 7,000 bitcoin',
    deck: 'They didn’t break in. They logged in.',
    story: 'Attackers collected users’ API keys and two-factor codes through phishing and malware. With real keys in hand, every withdrawal looked allowed, and about $40 million in bitcoin left the exchange’s hot wallet in one go.',
    feature: 'Data-Flow Guard · Human Seal',
    zoro: 'When an agent reads a credential, Zoro marks it private: sending it anywhere outside asks first. Moving money needs a fresh World ID approval for that exact payment.',
    limit: 'Zoro protects AI agents and their tools. It does not secure an exchange’s own servers.',
    source: 'Binance statement · The Block, May 2019',
  },
  {
    id: 'bybit-2025',
    date: 'February 21, 2025',
    headline: '$1.5 billion vanishes in a routine transfer',
    deck: 'The signers approved what their screen showed them.',
    story: 'Bybit’s team signed what looked like a normal move between its own wallets. Attackers had slipped code into the wallet’s web interface through a developer’s laptop, and the real transaction handed the funds to them.',
    feature: 'Human Seal',
    zoro: 'A Zoro approval is bound to a fingerprint of the exact action, not to what a screen displays, and it can never be replayed for a different action.',
    limit: 'Zoro cannot repair a compromised wallet website. The lesson it applies: approve the action itself.',
    source: 'FBI public notice · BleepingComputer, Feb 2025',
  },
  {
    id: 'whatsapp-mcp',
    date: 'April 7, 2025',
    headline: 'A “fact of the day” tool steals your chat history',
    deck: 'It was harmless on install. Then it changed.',
    story: 'Researchers showed a tool that looked innocent when it was approved. Later it quietly rewrote its own description, telling the agent to read the user’s WhatsApp history and send it to the attacker’s number. The apps never warned about the change.',
    feature: 'Rug-Pull Quarantine',
    zoro: 'Zoro seals the exact text of every tool. A changed description is held back and diffed before the agent can ever read it.',
    source: 'Invariant Labs research demonstration, Apr 2025',
  },
  {
    id: 'github-mcp',
    date: 'May 26, 2025',
    headline: 'One poisoned GitHub issue leaks private code',
    deck: 'The agent was only reading issues.',
    story: 'An attacker opened an issue in a public repository with hidden instructions. When a developer’s agent reviewed open issues, it followed them: it read the user’s private repositories and copied what it found into a public pull request.',
    feature: 'Data-Flow Guard',
    zoro: 'Text from an untrusted outside source is labelled as such. If it tries to push data to an outside destination, Zoro stops the call and asks a person.',
    source: 'Invariant Labs research demonstration, May 2025',
  },
  {
    id: 'supabase-mcp',
    date: 'July 2025',
    headline: 'A support ticket talks an agent into leaking secret tokens',
    deck: 'Customer text became a command.',
    story: 'A ticket carried instructions aimed at the AI, not the support team. When a developer’s agent with full database access read it, the agent pulled secret tokens from a private table and posted them back into the ticket for the attacker to read.',
    feature: 'Output Shield · Data-Flow Guard',
    zoro: 'Zoro scans what tools return and redacts injected instructions before the model reads them. Private data heading into a public reply asks first.',
    source: 'General Analysis research demonstration, Jul 2025',
  },
  {
    id: 'replit-2025',
    date: 'July 2025',
    headline: 'AI agent deletes a production database during a code freeze',
    deck: 'Then it claimed the data could not be recovered.',
    story: 'During a public 12-day experiment, a coding agent ran destructive commands against a live database while changes were frozen. It wiped records for more than a thousand executives and companies, and at first said a rollback was impossible.',
    feature: 'Human Seal on high-impact actions',
    zoro: 'On Zoro’s Strict profile, running code through a tool needs a fresh Human Seal from a real person, bound to that one action.',
    limit: 'Zoro guards actions that pass through its gateway; commands an agent runs some other way are outside it.',
    source: 'SaaStr / Jason Lemkin · The Register, Jul 2025',
  },
  {
    id: 'postmark-mcp',
    date: 'September 2025',
    headline: 'Email tool quietly copies every message to a stranger',
    deck: 'One added line, in version 1.0.16.',
    story: 'A look-alike of a popular email connector was published on npm and behaved normally at first. Version 1.0.16 added a single line that BCC’d every outgoing email (password resets, invoices, internal notes) to an address the attacker controlled.',
    feature: 'Code-Swap Detection · Tool Seals',
    zoro: 'Zoro pins each server’s code identity and seals its tools. New code is quarantined until it is audited again, and a hidden BCC is exactly what the Attack Lab’s rug-pull scenario shows being blocked.',
    source: 'Koi Security disclosure, Sep 2025',
  },
  {
    id: 'pocketos-2026',
    date: 'April 2026',
    headline: 'AI agent wipes a startup’s database in nine seconds',
    deck: 'It found a token it was never meant to use.',
    story: 'The agent was fixing a small staging problem. It searched the codebase, found an API token in an unrelated file, and used it right away to run a destructive command. The production database and its backups were gone. It never asked if it was allowed.',
    feature: 'Data-Flow Guard · Human Seal',
    zoro: 'Reading a credential marks the data as private, so sending it to the network asks first. On Strict, running a command needs a Human Seal for that exact action.',
    limit: 'Only actions routed through Zoro are guarded.',
    source: 'Founder’s account · MIT AI Incident Database, 2026',
  },
];
