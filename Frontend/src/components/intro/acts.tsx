'use client';

/**
 * The five acts of the Zoro Intro, placed on the 0…1 timeline (timeline.ts). The clock moves on its own, so every
 * scene is a card whose text arrives word by word when the scene starts. Heavier pieces (the 3D shield, the
 * newspapers) only mount while their act is near.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { motion, useMotionValueEvent, useTransform, type MotionValue } from 'motion/react';
import { ArrowRight, Eye, FileWarning, Fingerprint, KeyRound, Landmark, Lock, Megaphone, ScrollText, ShieldAlert, ShieldCheck, Siren, Type, UserCheck, Users, Wallet } from 'lucide-react';
import { NewsReel } from '../news/news-reel';
import { HeroShield3D } from '../three';
import { cx } from '../ui';
import type { IntroControls } from './intro';
import { FEATURES_RANGE, GUARD_AT, GUARD_END, HACKS_RANGE, PROBLEM, TRACKS_RANGE, beat } from './timeline';

const FADE = 0.006;

/** Whether the surrounding scene is on screen now; text inside uses it to start typing. */
const SceneOn = createContext(false);

/** Opacity / scale / lift for a scene living between `from` and `to` on the timeline. */
function Scene({ progress, from, to, children, className, hold }: { progress: MotionValue<number>; from: number; to: number; children: ReactNode; className?: string; hold?: boolean }) {
  const keys = [from, from + FADE, to - FADE, to];
  const opacity = useTransform(progress, keys, hold ? [0, 1, 1, 1] : [0, 1, 1, 0]);
  const scale = useTransform(progress, keys, hold ? [0.96, 1, 1, 1] : [0.96, 1, 1, 1.03]);
  const y = useTransform(progress, keys, hold ? [18, 0, 0, 0] : [18, 0, 0, -18]);
  const [inside, setInside] = useState(() => progress.get() >= from && (hold || progress.get() <= to));
  useMotionValueEvent(progress, 'change', (v) => setInside(v >= from && (hold || v <= to)));
  return (
    <motion.div style={{ opacity, scale, y }} className={cx('absolute inset-0 flex items-center justify-center px-5 pb-36 pt-20 md:pb-28', inside ? 'pointer-events-auto' : 'pointer-events-none', className)} aria-hidden={!inside}>
      <SceneOn.Provider value={inside}>{children}</SceneOn.Provider>
    </motion.div>
  );
}

/** Text that arrives one word at a time once its scene is on screen. */
function Typed({ text, delay = 0.15, speed = 0.07, className }: { text: string; delay?: number; speed?: number; className?: string }) {
  const on = useContext(SceneOn);
  const words = text.split(' ');
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <motion.span key={i} className="inline-block whitespace-pre" initial={false} animate={on ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 10, filter: 'blur(4px)' }} transition={{ duration: 0.35, delay: on ? delay + i * speed : 0 }} aria-hidden>
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </span>
  );
}

/** Fades in after a delay once its scene is on screen. */
function Later({ children, delay, className }: { children: ReactNode; delay: number; className?: string }) {
  const on = useContext(SceneOn);
  return (
    <motion.div className={className} initial={false} animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }} transition={{ duration: 0.5, delay: on ? delay : 0 }}>
      {children}
    </motion.div>
  );
}

/** True while progress is between a and b (for mounting heavy pieces only when needed). */
function useNear(progress: MotionValue<number>, a: number, b: number) {
  const [on, setOn] = useState(false);
  useMotionValueEvent(progress, 'change', (v) => setOn(v >= a && v <= b));
  return on;
}

const Kicker = ({ children }: { children: ReactNode }) => <p className="mb-4 text-center text-[12px] font-semibold uppercase tracking-[0.3em] text-[color:var(--intro-light)] md:text-[13px]">{children}</p>;

/** The intro's card: white, navy outline, a hard offset shadow and a coloured title strip, like a little window. */
function Card({ children, strip, title, icon, className }: { children: ReactNode; strip: string; title: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-hidden rounded-[18px] border-2 border-[color:var(--intro-text)] bg-white text-[color:var(--intro-text)] shadow-[6px_6px_0_var(--intro-text)]', className)}>
      <div className="flex items-center gap-2.5 border-b-2 border-[color:var(--intro-text)] px-5 py-2.5" style={{ background: strip }}>
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full border border-[color:var(--intro-text)] bg-white" />
          <span className="size-2.5 rounded-full border border-[color:var(--intro-text)] bg-white" />
          <span className="size-2.5 rounded-full border border-[color:var(--intro-text)] bg-white" />
        </span>
        {icon && <span className="ml-1 [&_svg]:size-4">{icon}</span>}
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em]">{title}</span>
      </div>
      <div className="p-6 md:p-9">{children}</div>
    </div>
  );
}

const TRACKS = [
  { name: 'ENS', role: 'The public name book', strip: 'var(--intro-mint)', icon: <Landmark />, line: 'Every tool version gets a name, like a phone-book entry. The safety verdict is written next to it, and only the auditor may write there.' },
  { name: 'World ID', role: 'The human check', strip: 'var(--intro-mid)', icon: <UserCheck />, line: 'Before something risky happens, a real person proves “it’s me, and I approve this exact action”. A bot can’t fake it.' },
  { name: 'Hedera', role: 'The public diary', strip: 'var(--peach)', icon: <ScrollText />, line: 'Every verdict is written into a public diary with a time stamp nobody can change, not even Zoro.' },
];

const FEATURES: { name: string; line: string; icon: ReactNode; strip: string }[] = [
  { name: 'Tool Seals', line: 'Each tool is checked and stamped before your AI may use it.', icon: <ShieldCheck />, strip: 'var(--intro-mint)' },
  { name: 'Rug-Pull Quarantine', line: 'A tool that suddenly changes is held back until it is checked again.', icon: <Lock />, strip: 'var(--intro-sky)' },
  { name: 'Secret-Code Decoder', line: 'Finds hidden, invisible text sneaked into a tool.', icon: <Eye />, strip: 'var(--intro-mid)' },
  { name: 'New-Power Alarm', line: 'Warns when a tool quietly gains a new ability, like sending email.', icon: <Siren />, strip: 'var(--intro-pink)' },
  { name: 'Data-Flow Guard', line: 'Private data can’t leave without a person saying yes.', icon: <KeyRound />, strip: 'var(--peach)' },
  { name: 'Output Shield', line: 'Strips sneaky instructions out of what tools send back.', icon: <ShieldAlert />, strip: 'var(--intro-butter)' },
  { name: 'Code-Swap Detection', line: 'Notices when the program behind a tool is swapped.', icon: <Fingerprint />, strip: 'var(--intro-mint)' },
  { name: 'Shadowing Detector', line: 'Catches one tool secretly giving orders about another.', icon: <Users />, strip: 'var(--intro-sky)' },
  { name: 'Auditor-Injection Guard', line: 'Ignores tools that try to sweet-talk the checker.', icon: <Megaphone />, strip: 'var(--intro-mid)' },
  { name: 'Typosquat Check', line: 'Spots look-alike names such as “gooogle-mail”.', icon: <Type />, strip: 'var(--intro-pink)' },
  { name: 'Wallet Recipient Limits', line: 'Money only goes to addresses you allowed.', icon: <Wallet />, strip: 'var(--peach)' },
  { name: 'Revocation & Exposure', line: 'If a tool turns bad later, Zoro blocks it and shows what it touched.', icon: <FileWarning />, strip: 'var(--intro-butter)' },
];

// ---------- the acts ----------

function ActProblem({ progress }: { progress: MotionValue<number> }) {
  const lines = [
    { title: 'How AI agents work', text: 'Your AI agent reads tool descriptions as instructions.', strip: 'var(--intro-sky)' },
    { title: 'The weak spot', text: 'It trusts them. Every time. No questions asked.', strip: 'var(--intro-mid)' },
    { title: 'The attack', text: 'One changed line is all an attacker needs.', strip: 'var(--intro-pink)' },
  ];
  return (
    <>
      {lines.map((l, i) => (
        <Scene key={l.text} progress={progress} from={beat(PROBLEM, i)} to={beat(PROBLEM, i + 1)}>
          <div className="w-full max-w-[860px]">
            <Kicker>Act I · The problem · {i + 1}/3</Kicker>
            <Card strip={l.strip} title={l.title}>
              <p className="font-display text-center text-[32px] leading-[1.1] md:text-[56px]">
                <Typed text={l.text} className={i === 2 ? 'text-[color:var(--intro-light)]' : undefined} />
              </p>
            </Card>
          </div>
        </Scene>
      ))}
    </>
  );
}

/** Act II: real incidents as newspaper front pages that spin in on the timer (components/news). */
function ActHeadlines({ progress }: { progress: MotionValue<number> }) {
  // the pile of pages clears away before the guard arrives
  const opacity = useTransform(progress, [HACKS_RANGE.end - 0.002, HACKS_RANGE.end + 0.006], [1, 0]);
  const near = useNear(progress, HACKS_RANGE.start - 0.01, HACKS_RANGE.end + 0.01);
  if (!near) return null;
  return (
    <motion.div style={{ opacity }} className="absolute inset-x-0 bottom-[150px] top-[64px] md:bottom-[110px]">
      <NewsReel
        progress={progress}
        from={HACKS_RANGE.start}
        to={HACKS_RANGE.end}
        kicker={(i, n) => (
          <Kicker>
            Act II · Real headlines · {String(i + 1).padStart(2, '0')}/{String(n).padStart(2, '0')}
          </Kicker>
        )}
      />
    </motion.div>
  );
}

function ActGuard({ progress }: { progress: MotionValue<number> }) {
  const near = useNear(progress, GUARD_AT - 0.02, GUARD_END + 0.01);
  const drop = useTransform(progress, [GUARD_AT, GUARD_AT + 0.015], [-160, 0]);
  return (
    <Scene progress={progress} from={GUARD_AT} to={GUARD_END}>
      <div className="flex w-full max-w-[1040px] flex-col items-center gap-4 md:flex-row md:gap-10">
        <motion.div style={{ y: drop }} className="w-[52vw] max-w-[340px] md:w-[38%]">
          {near && <HeroShield3D />}
        </motion.div>
        <div className="w-full md:flex-1">
          <Kicker>Act III · The guard</Kicker>
          <Card strip="var(--intro-mint)" title="Meet Zoro" icon={<ShieldCheck />}>
            <p className="font-display text-[30px] leading-[1.08] md:text-[48px]">
              <Typed text="Zoro is the guard at the door." />
            </p>
            <p className="mt-4 text-[16px] leading-[1.6] text-[color:var(--intro-text)]/80 md:text-[18px]">
              <Typed text="It checks every tool, holds back any change, and stops risky actions until a real person says yes." delay={0.9} speed={0.04} />
            </p>
          </Card>
        </div>
      </div>
    </Scene>
  );
}

function ActTracks({ progress }: { progress: MotionValue<number> }) {
  return (
    <>
      {TRACKS.map((t, i) => (
        <Scene key={t.name} progress={progress} from={beat(TRACKS_RANGE, i)} to={beat(TRACKS_RANGE, i + 1)}>
          <div className="w-full max-w-[680px]">
            <Kicker>
              Act IV · Built with · {i + 1}/{TRACKS.length}
            </Kicker>
            <Card strip={t.strip} title={t.role} icon={t.icon}>
              <p className="font-display text-[48px] leading-none md:text-[68px]">
                <Typed text={t.name} />
              </p>
              <p className="mt-4 text-[17px] leading-[1.6] md:text-[20px]">
                <Typed text={t.line} delay={0.5} speed={0.045} />
              </p>
            </Card>
          </div>
        </Scene>
      ))}
    </>
  );
}

/** Act V: the twelve features drop in as a wall of small cards, one at a time; the newest is highlighted. */
function ActFeatures({ progress, finish }: { progress: MotionValue<number>; finish: () => void }) {
  const { start, end } = FEATURES_RANGE;
  const [i, setI] = useState(-1);
  useMotionValueEvent(progress, 'change', (v) => setI(Math.min(FEATURES.length - 1, Math.floor(((v - start) / (end - start)) * FEATURES.length))));
  return (
    <>
      <Scene progress={progress} from={start} to={end} className="items-start md:items-center">
        <div className="w-full max-w-[1100px]">
          <Kicker>Act V · Twelve protections · {String(Math.max(0, i) + 1).padStart(2, '0')}/12</Kicker>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3.5">
            {FEATURES.map((f, n) => {
              const shown = n <= i;
              const current = n === i;
              return (
                <motion.div key={f.name} initial={false} animate={shown ? { opacity: 1, y: 0, rotate: 0, scale: current ? 1.04 : 1 } : { opacity: 0, y: 24, rotate: n % 2 ? 3 : -3, scale: 0.9 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }} className={cx('overflow-hidden rounded-[12px] border-2 border-[color:var(--intro-text)] bg-white', current ? 'shadow-[5px_5px_0_var(--intro-light)]' : 'shadow-[3px_3px_0_var(--intro-text)]')}>
                  <div className="flex items-center gap-2 border-b-2 border-[color:var(--intro-text)] px-3 py-1.5 [&_svg]:size-3.5" style={{ background: f.strip }}>
                    {f.icon}
                    <span className="font-mono text-[10.5px] font-semibold">{String(n + 1).padStart(2, '0')}</span>
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-[13.5px] font-bold leading-tight md:text-[15px]">{f.name}</p>
                    <p className="mt-1 hidden text-[12px] leading-snug text-[color:var(--intro-text)]/75 sm:block md:text-[12.5px]">{f.line}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </Scene>
      <Scene progress={progress} from={end} to={1.2} hold>
        <div className="w-full max-w-[760px]">
          <Card strip="var(--intro-butter)" title="That’s Zoro" icon={<ShieldCheck />}>
            <div className="flex flex-col items-center text-center">
              <p className="font-display text-[36px] leading-[1.06] md:text-[60px]">
                <Typed text="Put Zoro in front of your AI." />
              </p>
              <Later delay={0.9}>
                <button type="button" onClick={finish} className="mt-8 inline-flex h-14 items-center gap-2 rounded-full bg-[color:var(--intro-text)] px-8 text-[18px] font-semibold text-white transition-transform hover:scale-[1.04]">
                  Enter Zoro <ArrowRight className="size-5" />
                </button>
              </Later>
            </div>
          </Card>
        </div>
      </Scene>
    </>
  );
}

export function IntroActs({ progress, finish }: IntroControls) {
  return (
    <>
      <ActProblem progress={progress} />
      <ActHeadlines progress={progress} />
      <ActGuard progress={progress} />
      <ActTracks progress={progress} />
      <ActFeatures progress={progress} finish={finish} />
    </>
  );
}
