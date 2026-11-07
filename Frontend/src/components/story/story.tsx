'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Preloader, Spine } from './chrome';
import { DepthProvider, DepthToggle, scrollStore, useReducedMotion, useSmoothScroll } from './runtime';
import { Fingerprint, Hero, Risk, Sentinel } from './sections-1';
import { Human, Policy, Quarantine, Shield } from './sections-2';
import { Chain, Live, Seal, Verify } from './sections-3';
import { ThreeCtx } from './stage';
import { complete } from './three/loading';

const StoryCanvas = dynamic(() => import('./three/canvas'), { ssr: false });

const webglAvailable = () => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
};

/**
 * The journey of one tool call, from the agent to the server, told in the verdict palette:
 * grey = unknown, cyan = being inspected, green = sealed, amber = a person decides, red = blocked, violet = human,
 * silver = permanent record.
 */
export function Story() {
  const reduce = useReducedMotion();
  const [three, setThree] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const ok = !reduce && webglAvailable();
    setThree(ok);
    // Without the 3D layer there is nothing for the preloader to wait on.
    if (!ok) {
      complete('three');
      complete('frame');
    }
  }, [reduce]);

  useSmoothScroll(!reduce);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      scrollStore.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      scrollStore.pointerY = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, []);

  return (
    <DepthProvider>
      <ThreeCtx.Provider value={three}>
        <div className="story relative">
          <Hero />
          <Risk />
          <Fingerprint />
          <Sentinel />
          <Quarantine />
          <Policy />
          <Shield />
          <Human />
          <Seal />
          <Chain />
          <Live />
          <Verify />
        </div>
        {three && <StoryCanvas />}
        <Preloader enabled={three} />
        <Spine />
        {mounted &&
          createPortal(
            <div className="story fixed bottom-5 right-5 z-30 !bg-transparent">
              <DepthToggle />
            </div>,
            document.body,
          )}
      </ThreeCtx.Provider>
    </DepthProvider>
  );
}
