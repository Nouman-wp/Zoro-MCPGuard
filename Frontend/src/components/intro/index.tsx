'use client';

/**
 * Where the intro appears: once per browser session over the home page, and anytime at /intro.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Intro } from './intro';
import { IntroActs } from './acts';

export const INTRO_SEEN = 'zoro-intro-seen';

const markSeen = () => {
  try {
    sessionStorage.setItem(INTRO_SEEN, '1');
  } catch {
    /* storage blocked: it will simply show again next visit */
  }
};

/** Plays over the home page the first time it is opened in this browser session. */
export function IntroOnce() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(INTRO_SEEN) === '1';
    } catch {
      seen = false;
    }
    if (!seen) setShow(true);
  }, []);
  if (!show) return null;
  return (
    <Intro
      onDone={() => {
        markSeen();
        setShow(false);
      }}
    >
      {(c) => <IntroActs {...c} />}
    </Intro>
  );
}

/** The /intro page: plays every time, then goes to the home page. */
export function IntroPage() {
  const router = useRouter();
  return (
    <Intro
      onDone={() => {
        markSeen();
        router.push('/');
      }}
    >
      {(c) => <IntroActs {...c} />}
    </Intro>
  );
}
