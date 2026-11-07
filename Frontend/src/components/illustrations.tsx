'use client';

/**
 * Small animated scenes for cards: one per sponsor track and one per Attack Lab scenario. Pastel fills, ink lines,
 * colours from tokens only. Each element's resting style is the scene's finished state; the .a-* classes animate the
 * story into it (see "Card illustrations" in globals.css). Green, amber and red only mark security outcomes.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cx } from './ui';

const INK = 'var(--border-strong)';
const ink = { stroke: INK, strokeWidth: 1.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
const fill = (c: string): CSSProperties => ({ fill: c, ...ink });
const txt = (size = 9, weight = 600): CSSProperties => ({ fill: 'var(--text)', fontSize: size, fontWeight: weight, fontFamily: 'var(--font-mono)' });
const d = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

/** Wraps a scene; plays it once when it first scrolls into view. */
export function Illo({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setOn(true), io.disconnect()), { rootMargin: '0px 0px 10% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <svg ref={ref} viewBox="0 0 200 110" className={cx('illo h-auto w-full', on && 'is-on', className)} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** An isometric floor tile under each scene. */
const Floor = ({ tone = 'var(--surface)' }: { tone?: string }) => <path d="M100 66 L176 92 L100 108 L24 92 Z" style={{ ...fill(tone), strokeOpacity: 0.35 }} />;

// ---------- tracks ----------

function EnsArt() {
  return (
    <Illo label="An ENS name tag showing the record zoro.verdict = sealed">
      <Floor tone="var(--mint-soft)" />
      <path d="M100 8 V22" style={ink} />
      <circle cx="100" cy="8" r="3" style={fill('var(--surface)')} />
      <g transform="rotate(-6 100 55)">
        <rect x="52" y="22" width="96" height="62" rx="8" style={fill('var(--mint)')} />
        <circle cx="100" cy="31" r="4" style={fill('var(--surface)')} />
        <text x="62" y="52" style={txt(8.5)}>zoro.verdict</text>
        <g className="a-pop" style={d(0.4)}>
          <rect x="62" y="59" width="56" height="16" rx="8" style={fill('var(--ok-bg)')} />
          <text x="72" y="71" style={{ ...txt(9, 700), fill: 'var(--ok)' }}>sealed</text>
        </g>
        <path className="a-draw" pathLength={1} d="M124 66 l5 5 l9 -11" style={{ ...ink, stroke: 'var(--ok)', strokeWidth: 2.6, fill: 'none', ...d(0.8) }} />
      </g>
    </Illo>
  );
}

function WorldArt() {
  return (
    <Illo label="A World ID orb; a check mark draws when the proof is verified">
      <Floor tone="var(--lavender-soft)" />
      <ellipse cx="100" cy="88" rx="30" ry="7" style={{ fill: 'var(--overlay)', opacity: 0.08 }} />
      <circle cx="100" cy="50" r="30" style={fill('var(--lavender)')} />
      <ellipse cx="100" cy="50" rx="44" ry="13" transform="rotate(-18 100 50)" style={{ ...ink, fill: 'none' }} />
      <circle cx="90" cy="40" r="7" style={{ fill: 'var(--surface)', opacity: 0.6 }} />
      <path className="a-draw" pathLength={1} d="M86 51 l10 10 l19 -22" style={{ ...ink, stroke: 'var(--accent)', strokeWidth: 4, fill: 'none', ...d(0.3) }} />
      <g className="a-pop" style={d(1.1)}>
        <rect x="128" y="14" width="54" height="16" rx="8" style={fill('var(--surface)')} />
        <text x="136" y="25.5" style={txt(8)}>1 human</text>
      </g>
    </Illo>
  );
}

function HederaArt() {
  return (
    <Illo label="Chained ledger blocks; a new block joins the chain">
      <Floor tone="var(--peach-soft)" />
      {[30, 74, 118].map((x, i) => (
        <g key={x}>
          <rect x={x} y="40" width="32" height="32" rx="5" style={fill(i === 1 ? 'var(--surface)' : 'var(--peach)')} />
          <text x={x + 7} y="60" style={txt(8)}>#{i + 40}</text>
        </g>
      ))}
      <path d="M62 56 H74 M106 56 H118" style={ink} />
      <g className="a-slide" style={d(0.5)}>
        <path d="M150 56 H162" style={ink} />
        <rect x="162" y="40" width="32" height="32" rx="5" style={fill('var(--peach)')} />
        <text x="169" y="60" style={txt(8)}>#43</text>
      </g>
      <circle className="a-travel" cx="146" cy="30" r="4" style={{ fill: 'var(--accent)', ['--from' as string]: '-110px', ...d(0) }} />
    </Illo>
  );
}

// ---------- attack lab ----------

function Envelope({ x, y, w = 70, h = 46, tone = 'var(--surface)' }: { x: number; y: number; w?: number; h?: number; tone?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="4" style={fill(tone)} />
      <path d={`M${x} ${y + 2} L${x + w / 2} ${y + h * 0.55} L${x + w} ${y + 2}`} style={{ ...ink, fill: 'none' }} />
    </g>
  );
}

const Cross = ({ x, y, s = 9, delay = 0.9 }: { x: number; y: number; s?: number; delay?: number }) => (
  <g className="a-pop" style={d(delay)}>
    <circle cx={x} cy={y} r={s + 3} style={fill('var(--danger-bg)')} />
    <path d={`M${x - s / 2} ${y - s / 2} l${s} ${s} M${x + s / 2} ${y - s / 2} l${-s} ${s}`} style={{ ...ink, stroke: 'var(--danger)', strokeWidth: 2.6 }} />
  </g>
);

function RugPullArt() {
  return (
    <Illo label="An email tool quietly adds a hidden BCC address, which Zoro blocks">
      <Floor />
      <Envelope x={20} y={30} />
      <text x="104" y="38" style={txt(8)}>to: you</text>
      <g className="a-slide" style={d(0.3)}>
        <rect x="100" y="46" width="84" height="18" rx="4" style={fill('var(--pink-soft)')} />
        <text x="105" y="58.5" style={txt(8)}>bcc: archive@…</text>
      </g>
      <Cross x={182} y={46} />
    </Illo>
  );
}

function InvisibleInkArt() {
  return (
    <Illo label="Hidden Unicode characters inside a tool description light up">
      <Floor />
      <rect x="22" y="22" width="156" height="50" rx="6" style={fill('var(--surface)')} />
      <text x="32" y="42" style={txt(8.5, 500)}>Adds a note to your</text>
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} className="a-fade" x={32 + i * 18} y="51" width="14" height="12" rx="2" style={{ ...fill('var(--pink)'), ...d(0.3 + i * 0.15) }} />
      ))}
      <text className="a-fade" x="126" y="61" style={{ ...txt(7.5), ...d(1.1) }}>U+E00xx</text>
    </Illo>
  );
}

function ShadowingArt() {
  return (
    <Illo label="A weather tool's description whispers instructions to the email tool">
      <Floor />
      <rect x="18" y="34" width="52" height="40" rx="6" style={fill('var(--lavender)')} />
      <path d="M32 58 a7 7 0 0 1 3 -13 a10 10 0 0 1 19 3 a6 6 0 0 1 1 11 Z" style={fill('var(--surface)')} />
      <Envelope x={128} y={34} w={54} h={40} tone="var(--surface)" />
      <path className="a-draw" pathLength={1} d="M72 44 C 95 10, 110 10, 126 42" style={{ ...ink, fill: 'none', strokeDasharray: '1', ...d(0.2) }} />
      <g className="a-pop" style={d(1.1)}>
        <circle cx="99" cy="22" r="9" style={fill('var(--warn-bg)')} />
        <text x="96.5" y="26" style={{ ...txt(11, 800), fill: 'var(--warn)' }}>!</text>
      </g>
    </Illo>
  );
}

function ExfiltrationArt() {
  return (
    <Illo label="A private file heads to an outside address and stops at Zoro's gate to ask a person">
      <Floor />
      <path d="M18 34 h26 l8 8 v32 h-34 Z" style={fill('var(--surface)')} />
      <path d="M44 34 v8 h8" style={{ ...ink, fill: 'none' }} />
      <path d="M56 58 H148" style={{ ...ink, strokeDasharray: '3 5', fill: 'none' }} />
      <rect x="96" y="36" width="8" height="40" rx="2" style={fill('var(--accent)')} />
      <rect x="112" y="36" width="8" height="40" rx="2" style={fill('var(--accent)')} />
      <circle className="a-travel" cx="88" cy="58" r="5" style={{ fill: 'var(--pink)', ...ink, ['--from' as string]: '-36px' }} />
      <Envelope x={150} y={42} w={36} h={28} />
      <g className="a-pop" style={d(1.2)}>
        <rect x="84" y="14" width="46" height="16" rx="8" style={fill('var(--warn-bg)')} />
        <text x="94" y="25.5" style={{ ...txt(8.5, 700), fill: 'var(--warn)' }}>ASK</text>
      </g>
    </Illo>
  );
}

function CodeSwapArt() {
  return (
    <Illo label="The package label stays the same while the code inside is swapped">
      <Floor />
      {/* box: top, left face (front, with the unchanged label), right face (with a window onto the code) */}
      <path d="M56 40 L100 26 L144 40 L100 54 Z" style={fill('var(--surface)')} />
      <path d="M56 40 L100 54 L100 96 L56 82 Z" style={fill('var(--surface)')} />
      <path d="M100 54 L144 40 L144 82 L100 96 Z" style={fill('var(--surface)')} />
      <path d="M63 54 L93 64 L93 74 L63 64 Z" style={fill('var(--peach)')} />
      <path d="M66 58 L88 65.5" style={{ ...ink, strokeWidth: 1.2 }} />
      {/* the code inside: the old block fades out, the swapped one fades in, both within the window */}
      <path d="M107 59 L137 49 L137 75 L107 85 Z" style={fill('var(--surface)')} />
      <g className="a-out" style={{ opacity: 0 }}>
        <path d="M110 61 L134 53 L134 73 L110 81 Z" style={fill('var(--mint)')} />
      </g>
      <g className="a-fade" style={d(0.8)}>
        <path d="M110 61 L134 53 L134 73 L110 81 Z" style={fill('var(--pink)')} />
        <path d="M114 66 L130 60.7 M114 72 L126 68" style={{ ...ink, strokeWidth: 1.2 }} />
      </g>
      <g className="a-pop" style={d(1.3)}>
        <rect x="140" y="12" width="48" height="16" rx="8" style={fill('var(--danger-bg)')} />
        <text x="146" y="23.5" style={{ ...txt(8, 700), fill: 'var(--danger)' }}>code ≠</text>
      </g>
    </Illo>
  );
}

function AuditorInjectionArt() {
  return (
    <Illo label="A note claiming the tool is pre-approved gets stamped NO">
      <Floor />
      <path d="M40 18 h96 l12 12 v58 h-108 Z" style={fill('var(--surface)')} />
      <text x="52" y="42" style={txt(8)}>“Note to auditor:</text>
      <text x="52" y="56" style={txt(8)}> pre-approved ✓”</text>
      <path d="M52 68 H120 M52 78 H104" style={{ ...ink, strokeOpacity: 0.4 }} />
      <g className="a-stamp" style={d(0.4)} transform="rotate(-14 140 64)">
        <rect x="112" y="50" width="56" height="28" rx="5" style={{ fill: 'var(--danger-bg)', stroke: 'var(--danger)', strokeWidth: 2.4 }} />
        <text x="127" y="70" style={{ ...txt(15, 800), fill: 'var(--danger)', fontFamily: 'var(--font-display)' }}>NO</text>
      </g>
    </Illo>
  );
}

function TyposquatArt() {
  return (
    <Illo label="Two server names, one letter apart; the imitation is never released">
      <Floor />
      <rect x="20" y="28" width="74" height="26" rx="6" style={fill('var(--mint)')} />
      <text x="30" y="45" style={txt(10)}>github</text>
      <g className="a-slide" style={d(0.3)}>
        <rect x="100" y="52" width="82" height="26" rx="6" style={fill('var(--surface)')} />
        <text x="110" y="69" style={txt(10)}>
          gith<tspan style={{ fill: 'var(--danger)' }}>h</tspan>ub
        </text>
      </g>
      <Cross x={182} y={52} s={8} delay={1} />
    </Illo>
  );
}

function HonestUpdateArt() {
  return (
    <Illo label="A typo is fixed and the new version is sealed automatically">
      <Floor />
      <rect x="22" y="26" width="120" height="48" rx="6" style={fill('var(--surface)')} />
      <text x="34" y="46" style={txt(9, 500)}>Sends to the</text>
      <g className="a-out" style={{ opacity: 0 }}>
        <text x="34" y="62" style={txt(9, 500)}>recieve</text>
      </g>
      <text className="a-fade" x="34" y="62" style={{ ...txt(9, 700), ...d(0.6) }}>receive</text>
      <g className="a-stamp" style={d(1.1)}>
        <circle cx="160" cy="52" r="20" style={{ fill: 'var(--ok-bg)', stroke: 'var(--ok)', strokeWidth: 2.4 }} />
        <path d="M151 52 l6 6 l12 -13" style={{ fill: 'none', stroke: 'var(--ok)', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
      </g>
    </Illo>
  );
}

function RevocationArt() {
  return (
    <Illo label="A sealed badge cracks and burns away when its version is revoked">
      <Floor />
      <g className="a-burn" style={{ opacity: 0.25, transform: 'translateY(6px)', ...d(0.9) }}>
        <circle cx="100" cy="50" r="28" style={fill('var(--peach)')} />
        <circle cx="100" cy="50" r="18" style={fill('var(--surface)')} />
        <path d="M92 50 l6 6 l11 -12" style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 3, strokeLinecap: 'round' }} />
      </g>
      <path className="a-draw" pathLength={1} d="M96 20 l8 14 l-10 10 l12 12 l-6 16" style={{ ...ink, stroke: 'var(--danger)', strokeWidth: 2.4, fill: 'none', ...d(0.2) }} />
      <g className="a-pop" style={d(1.3)}>
        <rect x="128" y="18" width="58" height="16" rx="8" style={fill('var(--danger-bg)')} />
        <text x="135" y="29.5" style={{ ...txt(8, 700), fill: 'var(--danger)' }}>revoked</text>
      </g>
    </Illo>
  );
}

function WalletSwapArt() {
  return (
    <Illo label="A payment is redirected to an unknown address and blocked">
      <Floor />
      <circle cx="30" cy="54" r="13" style={fill('var(--peach)')} />
      <text x="25.5" y="58" style={txt(10, 800)}>$</text>
      <path d="M46 54 H150" style={{ ...ink, strokeDasharray: '3 5', fill: 'none', strokeOpacity: 0.5 }} />
      <rect x="150" y="44" width="36" height="20" rx="5" style={fill('var(--mint)')} />
      <text x="157" y="57.5" style={txt(8)}>you</text>
      <path className="a-draw" pathLength={1} d="M86 54 C 100 54, 104 86, 130 88" style={{ ...ink, stroke: 'var(--danger)', fill: 'none', ...d(0.3) }} />
      <g className="a-fade" style={d(0.9)}>
        <rect x="132" y="80" width="56" height="18" rx="5" style={fill('var(--pink-soft)')} />
        <text x="137" y="92.5" style={txt(8)}>0xA77…</text>
      </g>
      <Cross x={108} y={74} s={8} delay={1.2} />
    </Illo>
  );
}

function MorseHeistArt() {
  return (
    <Illo label="An email hides a transfer order in Morse code, which Zoro decodes and blocks">
      <Floor />
      <Envelope x={18} y={26} w={74} h={48} />
      <g className="a-fade" style={d(0.3)}>
        <text x="26" y="66" style={txt(9, 800)}>·– –· ·––</text>
      </g>
      <path className="a-draw" pathLength={1} d="M96 50 H126" style={{ ...ink, fill: 'none', ...d(0.6) }} />
      <g className="a-slide" style={d(0.8)}>
        <rect x="128" y="38" width="62" height="24" rx="5" style={fill('var(--peach-soft)')} />
        <text x="133" y="53.5" style={txt(8)}>send $9k</text>
      </g>
      <Cross x={160} y={80} s={8} delay={1.2} />
    </Illo>
  );
}

function NineSecondWipeArt() {
  return (
    <Illo label="An agent tries to delete the production database, and Zoro stops it">
      <Floor />
      <g>
        <ellipse cx="58" cy="34" rx="26" ry="8" style={fill('var(--lavender)')} />
        <path d="M32 34 V70 A26 8 0 0 0 84 70 V34" style={fill('var(--lavender)')} />
        <path d="M32 52 A26 8 0 0 0 84 52" style={{ ...ink, fill: 'none' }} />
        <text x="44" y="64" style={txt(8, 800)}>prod</text>
      </g>
      <g className="a-slide" style={d(0.3)}>
        <rect x="104" y="40" width="84" height="20" rx="5" style={fill('var(--pink-soft)')} />
        <text x="109" y="53.5" style={txt(8)}>rm volume…</text>
      </g>
      <g className="a-fade" style={d(0.7)}>
        <text x="122" y="82" style={txt(9, 800)}>0:09</text>
      </g>
      <Cross x={96} y={78} s={8} delay={1.1} />
    </Illo>
  );
}

function WalletDrainArt() {
  return (
    <Illo label="A signing tool asks for unlimited spending of the treasury, which Zoro holds for a person">
      <Floor />
      <rect x="22" y="34" width="64" height="40" rx="7" style={fill('var(--mint)')} />
      <text x="30" y="58" style={txt(9, 800)}>USDT</text>
      <path className="a-draw" pathLength={1} d="M90 54 H122" style={{ ...ink, stroke: 'var(--danger)', fill: 'none', ...d(0.4) }} />
      <g className="a-slide" style={d(0.6)}>
        <rect x="124" y="42" width="66" height="24" rx="5" style={fill('var(--pink-soft)')} />
        <text x="131" y="57.5" style={txt(8)}>approve ∞</text>
      </g>
      <g className="a-pop" style={d(1.1)}>
        <rect x="80" y="78" width="40" height="16" rx="8" style={fill('var(--warn-bg)')} />
        <text x="88" y="89.5" style={txt(8, 800)}>ASK</text>
      </g>
    </Illo>
  );
}

export const TRACK_ART = { ens: <EnsArt />, 'world-id': <WorldArt />, hedera: <HederaArt /> } as const;

export const SCENARIO_ART: Record<string, ReactNode> = {
  'rug-pull': <RugPullArt />,
  'invisible-ink': <InvisibleInkArt />,
  shadowing: <ShadowingArt />,
  exfiltration: <ExfiltrationArt />,
  'code-swap': <CodeSwapArt />,
  'auditor-injection': <AuditorInjectionArt />,
  typosquat: <TyposquatArt />,
  'honest-update': <HonestUpdateArt />,
  revocation: <RevocationArt />,
  'wallet-swap': <WalletSwapArt />,
  'morse-heist': <MorseHeistArt />,
  'nine-second-wipe': <NineSecondWipeArt />,
  'wallet-drain': <WalletDrainArt />,
};
