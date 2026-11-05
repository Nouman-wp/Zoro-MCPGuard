import type { Capability } from './types';

/**
 * Transaction decoder: before any sign/send call, say in one plain sentence what it will do — who receives what, and
 * whether it hands a contract unlimited spending power. Decodes raw ERC-20 / ERC-721 calldata and simple
 * "to / amount / token" tool arguments. Nothing is fetched from a chain: token metadata comes from a built-in list.
 */

export type TxKind = 'native_transfer' | 'token_transfer' | 'token_transfer_from' | 'token_approval' | 'approval_for_all' | 'permit' | 'contract_call';

export interface DecodedTransaction {
  kind: TxKind;
  /** who ends up with the funds or the permission */
  recipient: string | null;
  /** the token or target contract, for calldata */
  contract: string | null;
  token: string | null;
  amount: string | null;
  amountNumber: number | null;
  unlimited: boolean;
  selector: string | null;
  knownRecipient: boolean;
  sentence: string;
  risks: string[];
  risk: 'high' | 'medium' | 'low';
}

interface TokenInfo {
  symbol: string;
  decimals: number;
}

/** Well-known token contracts (Ethereum mainnet and Sepolia). Unknown contracts are always called out. */
export const KNOWN_TOKENS: Record<string, TokenInfo> = {
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8 },
  '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238': { symbol: 'USDC', decimals: 6 },
  '0x7169d38820dfd117c3fa1f22a697dba58d90ba06': { symbol: 'USDT', decimals: 6 },
  '0xfff9976782d46cc05630d1f6ebab18b2324d6b14': { symbol: 'WETH', decimals: 18 },
};

const SELECTORS: Record<string, { kind: TxKind; name: string }> = {
  '0xa9059cbb': { kind: 'token_transfer', name: 'transfer(address,uint256)' },
  '0x23b872dd': { kind: 'token_transfer_from', name: 'transferFrom(address,address,uint256)' },
  '0x095ea7b3': { kind: 'token_approval', name: 'approve(address,uint256)' },
  '0x39509351': { kind: 'token_approval', name: 'increaseAllowance(address,uint256)' },
  '0xa22cb465': { kind: 'approval_for_all', name: 'setApprovalForAll(address,bool)' },
  '0xd505accf': { kind: 'permit', name: 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)' },
};

const MAX_UINT = (1n << 256n) - 1n;
const UNLIMITED_THRESHOLD = 1n << 200n;

export const shortAddr = (a: string) => (/^0x[0-9a-fA-F]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const word = (data: string, i: number) => data.slice(10 + i * 64, 10 + (i + 1) * 64);
const addrAt = (data: string, i: number) => `0x${word(data, i).slice(24)}`;
const uintAt = (data: string, i: number) => {
  const w = word(data, i);
  return w.length === 64 ? BigInt(`0x${w}`) : null;
};

function formatUnits(v: bigint, decimals: number): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 6);
  return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${frac ? `.${frac}` : ''}`;
}

const pick = (args: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) {
    const v = args[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
};

export interface DecodeOptions {
  /** recipients the user has paid or allowlisted before (lower-case comparison) */
  knownAddresses?: string[];
  /** amount above which a transfer counts as large (in token units, as given) */
  largeAmount?: number;
}

/**
 * Decode a sign/send call. Returns null when the call does not look like a transaction (no calldata, no recipient and
 * amount), so ordinary tools are never annotated.
 */
export function decodeTransactionCall(tool: string, capabilities: Capability[], args: Record<string, unknown>, opts: DecodeOptions = {}): DecodedTransaction | null {
  const known = new Set((opts.knownAddresses ?? []).map((a) => a.toLowerCase()));
  const large = opts.largeAmount ?? 1000;
  const data = pick(args, ['data', 'calldata', 'input', 'callData', 'tx_data']);
  const to = pick(args, ['to', 'recipient', 'address', 'destination', 'receiver', 'contract', 'target']);
  const amountRaw = pick(args, ['amount', 'value', 'quantity', 'sum']);
  const tokenArg = pick(args, ['token', 'symbol', 'asset', 'currency', 'coin']);
  const financial = capabilities.includes('financial_action') || capabilities.includes('transaction_signing');

  if (data && /^0x[0-9a-fA-F]{8}/.test(data)) {
    const sel = data.slice(0, 10).toLowerCase();
    const info = SELECTORS[sel];
    const contract = to;
    const tokenInfo = contract ? KNOWN_TOKENS[contract.toLowerCase()] : undefined;
    const tokenName = tokenInfo?.symbol ?? (tokenArg ? tokenArg.toUpperCase() : contract ? `tokens of the unknown contract ${shortAddr(contract)}` : 'tokens');
    const risks: string[] = [];
    if (contract && !tokenInfo) risks.push(`The token contract ${shortAddr(contract)} is not a well-known token.`);
    if (!info) {
      risks.push(`Calls function ${sel} on ${contract ? shortAddr(contract) : 'a contract'}, which Zoro cannot decode.`);
      return { kind: 'contract_call', recipient: contract, contract, token: null, amount: null, amountNumber: null, unlimited: false, selector: sel, knownRecipient: contract ? known.has(contract.toLowerCase()) : false, sentence: `Calls an unrecognized function (${sel}) on ${contract && !known.has(contract.toLowerCase()) ? 'an unknown contract ' : ''}${contract ? shortAddr(contract) : 'a contract'}.`, risks, risk: contract && known.has(contract.toLowerCase()) ? 'medium' : 'high' };
    }
    const fmt = (v: bigint | null) => (v === null ? null : tokenInfo ? formatUnits(v, tokenInfo.decimals) : v.toString());
    if (info.kind === 'token_transfer') {
      const r = addrAt(data, 0);
      const v = uintAt(data, 1);
      const isKnown = known.has(r.toLowerCase());
      const amt = fmt(v);
      const num = amt ? Number(amt.replace(/,/g, '')) : null;
      if (!isKnown) risks.push(`The recipient ${shortAddr(r)} is not one you have paid or allowlisted.`);
      if (num !== null && num > large) risks.push(`${amt} ${tokenName} is above the large-transfer threshold (${large}).`);
      return { kind: 'token_transfer', recipient: r, contract, token: tokenInfo?.symbol ?? null, amount: amt, amountNumber: num, unlimited: false, selector: sel, knownRecipient: isKnown, sentence: `Sends ${amt ?? 'an unknown amount of'} ${tokenName} to ${isKnown ? 'a known address' : 'an address you have never paid'} (${shortAddr(r)}).`, risks, risk: !isKnown || (num ?? 0) > large ? 'high' : 'low' };
    }
    if (info.kind === 'token_transfer_from') {
      const from = addrAt(data, 0);
      const r = addrAt(data, 1);
      const v = uintAt(data, 2);
      risks.push(`Moves tokens out of ${shortAddr(from)} using an existing allowance.`);
      const isKnown = known.has(r.toLowerCase());
      if (!isKnown) risks.push(`The recipient ${shortAddr(r)} is not known.`);
      return { kind: 'token_transfer_from', recipient: r, contract, token: tokenInfo?.symbol ?? null, amount: fmt(v), amountNumber: null, unlimited: false, selector: sel, knownRecipient: isKnown, sentence: `Moves ${fmt(v) ?? 'tokens'} ${tokenName} from ${shortAddr(from)} to ${isKnown ? 'a known address' : 'an unknown address'} (${shortAddr(r)}).`, risks, risk: 'high' };
    }
    if (info.kind === 'token_approval' || info.kind === 'permit') {
      const spender = info.kind === 'permit' ? addrAt(data, 1) : addrAt(data, 0);
      const v = info.kind === 'permit' ? uintAt(data, 2) : uintAt(data, 1);
      const unlimited = v !== null && (v === MAX_UINT || v >= UNLIMITED_THRESHOLD);
      const isKnown = known.has(spender.toLowerCase());
      if (unlimited) risks.push('Grants UNLIMITED spending: the spender can move every token of this kind you hold, now or later, without asking again.');
      if (!isKnown) risks.push(`The spender ${shortAddr(spender)} is an unknown contract.`);
      const what = unlimited ? `UNLIMITED ${tokenName}` : `${fmt(v) ?? 'some'} ${tokenName}`;
      return { kind: info.kind, recipient: spender, contract, token: tokenInfo?.symbol ?? null, amount: unlimited ? 'unlimited' : fmt(v), amountNumber: null, unlimited, selector: sel, knownRecipient: isKnown, sentence: `Gives ${what} spending to ${isKnown ? 'a known contract' : 'an unknown contract'} ${shortAddr(spender)}${info.kind === 'permit' ? ' (by signed permit)' : ''}.`, risks, risk: unlimited || !isKnown ? 'high' : 'medium' };
    }
    if (info.kind === 'approval_for_all') {
      const operator = addrAt(data, 0);
      const approved = (uintAt(data, 1) ?? 0n) !== 0n;
      const isKnown = known.has(operator.toLowerCase());
      if (approved) risks.push('Hands control of EVERY NFT in this collection to the operator.');
      return { kind: 'approval_for_all', recipient: operator, contract, token: null, amount: approved ? 'all' : 'none', amountNumber: null, unlimited: approved, selector: sel, knownRecipient: isKnown, sentence: approved ? `Gives ${isKnown ? 'a known' : 'an unknown'} operator ${shortAddr(operator)} control of ALL your NFTs in collection ${contract ? shortAddr(contract) : ''}.`.replace(/ \.$/, '.') : `Revokes operator ${shortAddr(operator)}.`, risks, risk: approved ? 'high' : 'low' };
    }
  }

  if (!financial || !to || !amountRaw) return null;
  const num = Number(String(amountRaw).replace(/,/g, ''));
  const isKnown = known.has(to.toLowerCase());
  const token = tokenArg ? tokenArg.toUpperCase() : 'native currency';
  const risks: string[] = [];
  if (!isKnown) risks.push(`The recipient ${shortAddr(to)} is not one you have paid or allowlisted.`);
  if (Number.isFinite(num) && num > large) risks.push(`${num.toLocaleString('en-US')} ${token} is above the large-transfer threshold (${large}).`);
  const amount = Number.isFinite(num) ? num.toLocaleString('en-US') : String(amountRaw);
  return {
    kind: tokenArg ? 'token_transfer' : 'native_transfer',
    recipient: to,
    contract: null,
    token: tokenArg ? token : null,
    amount,
    amountNumber: Number.isFinite(num) ? num : null,
    unlimited: false,
    selector: null,
    knownRecipient: isKnown,
    sentence: `Sends ${amount} ${token} to ${isKnown ? 'a known address' : /\.eth$/i.test(to) ? 'the ENS name' : 'an address you have never paid'} (${shortAddr(to)}).`,
    risks,
    risk: !isKnown || (Number.isFinite(num) && num > large) ? 'high' : 'low',
  };
}

/** Calldata builders for tests and the Attack Lab. */
export const encodeApprove = (spender: string, amount: bigint) => `0x095ea7b3${spender.toLowerCase().replace(/^0x/, '').padStart(64, '0')}${amount.toString(16).padStart(64, '0')}`;
export const encodeTransfer = (to: string, amount: bigint) => `0xa9059cbb${to.toLowerCase().replace(/^0x/, '').padStart(64, '0')}${amount.toString(16).padStart(64, '0')}`;
export const MAX_UINT256 = MAX_UINT;
