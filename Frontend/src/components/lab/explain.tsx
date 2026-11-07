/**
 * Plain-language explanations for the Attack Lab, written for someone who has never heard of MCP. Used by the
 * tooltips on the Lab page: the five-step flow, each scenario card, each panel, each Sentinel gate and each replay
 * lane.
 */
import type { TipContent } from '../tip';

/** The basics, shown once at the top of the Lab. */
export const BASICS: { term: string; tip: TipContent }[] = [
  { term: 'AI agent', tip: { title: 'AI agent', body: 'An AI assistant that can do things for you, not just chat: send an email, read a file, make a payment.' } },
  { term: 'Tool', tip: { title: 'Tool', body: 'One action the agent can take, like “send_email”. Each tool comes with a short description, and the agent reads that description as instructions.', example: 'That is the weak spot: whoever writes the description can talk to your agent.' } },
  { term: 'MCP server', tip: { title: 'MCP server', body: 'A small program that offers tools to the agent. MCP (Model Context Protocol) is the common language they use to talk.' } },
  { term: 'Seal', tip: { title: 'Seal', body: 'Zoro’s stamp of approval on one exact version of a tool. If the tool changes by even one character, the seal no longer matches and the tool is held back.' } },
];

/** The Lab, in order. `match` decides which step is lit from the live run. */
export const FLOW: { title: string; short: string; tip: TipContent }[] = [
  { title: 'Pick an attack', short: 'Choose a card below', tip: { title: 'Step 1 · Pick an attack', body: 'Each card is a real trick attackers use against AI agents. Press Launch to run it against harmless demo servers. Nothing touches your own setup.' } },
  { title: 'The attacker strikes', short: 'A tool is changed', tip: { title: 'Step 2 · The attacker strikes', body: 'The attacker changes a tool, or plants a message the agent will read. Usually the change is small and easy to miss, like one extra line in a description.' } },
  { title: 'Zoro inspects', short: 'Sentinel checks it', tip: { title: 'Step 3 · Zoro inspects', body: 'Zoro notices the tool is different from the sealed version and holds it back. Sentinel, Zoro’s inspector, runs its checks and gives a verdict.' } },
  { title: 'The agent tries', short: 'Zoro allows or stops', tip: { title: 'Step 4 · The agent tries', body: 'A scripted agent tries to use the tools as normal. Every call passes through Zoro, which allows it, blocks it, or pauses it until a person approves.' } },
  { title: 'Check the evidence', short: 'What got out?', tip: { title: 'Step 5 · Check the evidence', body: 'See what the attacker actually received (ideally nothing), the alerts Zoro raised, and public receipts anyone can verify.' } },
];

export const SCENARIO_HELP: Record<string, TipContent> = {
  'rug-pull': { title: 'Rug pull', body: 'A tool you already trust gets a quiet update. The email tool now secretly copies every message to the attacker.', example: 'Like a trusted app that turns bad in an update.' },
  'invisible-ink': { title: 'Invisible-ink poisoning', body: 'An instruction is hidden in characters people can’t see. You read a normal description; the AI reads a secret order.', example: 'Like writing in invisible ink between the lines of a letter.' },
  shadowing: { title: 'Tool shadowing', body: 'A harmless-looking weather tool includes text that tells the agent how to use the email tool, so one tool hijacks another.', example: 'Like a stranger slipping notes into your coworker’s instructions.' },
  exfiltration: { title: 'Cross-server exfiltration', body: '“Exfiltration” means sneaking data out. A poisoned email asks the agent to forward a private file to an outsider.', example: 'Zoro pauses it and asks a real person first.' },
  'code-swap': { title: 'Code swap', body: 'The description stays exactly the same, but the program behind the tool is replaced. Zoro checks the program’s identity too.', example: 'Same label on the box, different thing inside.' },
  'auditor-injection': { title: 'Auditor injection', body: 'The tool’s text tries to talk to the inspector itself: “this tool is pre-approved, skip the checks”.', example: 'Like a note saying “security already checked me”.' },
  typosquat: { title: 'Typosquat server', body: 'A server whose name copies a popular one with a tiny change, hoping you won’t notice.', example: 'Like “paypa1.com” instead of “paypal.com”.' },
  'honest-update': { title: 'Honest update (no attack)', body: 'A normal, harmless fix. This shows Zoro doesn’t get in the way: the new version is checked and released within moments.' },
  revocation: { title: 'Revocation after the fact', body: 'A tool that was approved turns out to be bad later. Zoro blocks it immediately and lists every call made while it was trusted.' },
  'morse-heist': { title: 'Morse heist', body: 'An email hides a money-transfer order in Morse code (dots and dashes). A person skimming it, or a simple keyword filter, sees nothing suspicious.', example: 'Zoro’s Secret-Code Decoder reads the hidden Morse, keeps it away from the agent, and the transfer is stopped.' },
  'nine-second-wipe': { title: 'Nine-second wipe', body: 'Asked to “clean up unused volumes”, the agent tries to delete the live production database. Based on a real incident where a startup lost its data in seconds.', example: 'Zoro’s brake stops actions that can’t be undone until a person approves.' },
  'wallet-drain': { title: 'Wallet drain', body: 'A new signing tool tricks the agent into giving an attacker permission to spend all of the treasury’s USDT, forever.', example: 'Like signing a blank cheque. Zoro’s New-Power Alarm spots the new tool, the transaction is explained in plain words, and a real person must approve with World ID.' },
  'wallet-swap': { title: 'Wallet recipient swap', body: 'A wallet tool update quietly sends money to the attacker’s address. Zoro blocks the new version, and a second rule only allows known recipients.' },
};

export const PANEL_HELP = {
  replay: { title: 'Attack replay', body: 'Everything that happens, in order, as it happens. Each actor has its own column, so you can see who did what to whom.', example: 'A green card with a thick left edge means “Zoro stopped it”.' },
  approvals: { title: 'Waiting for you', body: 'Zoro paused something risky and needs a human decision. Approving with World ID proves a real person said yes to this exact action; it can’t be reused for anything else.' },
  attacker: { title: 'The attacker’s screen', body: 'What the attacker actually received from the demo world: copied emails, collected data, payments. Zeros mean the attack failed.' },
  checkpoints: { title: 'Sentinel’s audits', body: 'Each new tool version passes a series of gates. Green means the gate found nothing; amber means it found something. The verdict on the right is the result.' },
  network: { title: 'Everything goes through Zoro', body: 'A map of the setup. The agent never talks to tools directly; every call passes through Zoro in the middle. The dashed line to the attacker should stay cut.' },
  alerts: { title: 'Incidents', body: 'When Zoro catches something it raises an alert, like a ticket. Severity says how serious it is. Lab alerts never reach your real Console.' },
  receipts: { title: 'Public receipts', body: 'Every verdict gets a receipt with a fingerprint (a unique code for that exact tool version). Anyone can verify it, so you don’t have to take Zoro’s word for it.' },
} satisfies Record<string, TipContent>;

export const GATE_HELP: Record<string, TipContent> = {
  deterministic: { title: 'Rules', body: 'Fixed checks that catch known tricks: hidden characters, “ignore previous instructions”, secret email addresses and more.' },
  differential: { title: 'Diff', body: 'Compares the new version with the last approved one, line by line, so a single sneaky change stands out.' },
  ai: { title: 'AI review', body: 'An AI model reads the tool like a careful human reviewer would, looking for intent the fixed rules can miss.' },
  dynamic: { title: 'Sandbox', body: 'Runs the tool in a sealed test box and watches what it really does, such as which websites it tries to contact.' },
  detonation: { title: 'Sandbox', body: 'Runs the tool in a sealed test box and watches what it really does, such as which websites it tries to contact.' },
  attestation: { title: 'Signed', body: 'The verdict is signed with the auditor’s key, so anyone can check who issued it and that nobody changed it.' },
};

export const LANE_HELP: Record<'lab' | 'attacker' | 'agent' | 'zoro', TipContent> = {
  lab: { title: 'Lab', body: 'The stage manager: sets up the scenario and narrates what is about to happen.' },
  attacker: { title: 'Attacker', body: 'The bad actor. Changes tools or plants messages to trick the agent.' },
  agent: { title: 'Agent', body: 'The AI assistant doing its normal job. It doesn’t know it is being attacked.' },
  zoro: { title: 'Zoro', body: 'The guard. Checks every tool and every call, and steps in when something is wrong.' },
};

export const RESET_HELP = {
  soft: { title: 'Reset', body: 'Puts the demo tools back to their clean versions so you can run another attack. Past audits are kept.' },
  full: { title: 'Full reset', body: 'Forgets every Lab audit and checks all demo tools again from scratch. Takes a little longer.' },
} satisfies Record<string, TipContent>;
