'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Canvas } from '@react-three/fiber';
import { View } from '@react-three/drei';
import { complete } from './loading';

/**
 * One WebGL context for the whole page. Each scene is a drei <View> placed in its section; this fixed canvas draws
 * them all, and only the ones on screen. It is portalled to <body> because the page sits inside a transformed
 * wrapper (the site's page transition), which would otherwise trap position: fixed.
 */
export default function StoryCanvas() {
  useEffect(() => complete('three'), []);
  return createPortal(
    <Canvas
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 1 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      aria-hidden
    >
      <View.Port />
    </Canvas>,
    document.body,
  );
}
