'use client';

/**
 * The hero's 3D Zoro shield: an extruded, bevelled shield with pastel faces and ink outlines, a raised glass panel and
 * the Z emblem, floating freely while small tiles orbit it. It leans toward the pointer.
 * Loaded lazily (see ./index.tsx); stops rendering while off screen.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Edges, Float, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { shieldShape, zShape } from './shapes';
import { useCssColors, useOnScreen } from './use-scene';

const TOKENS = ['lavender', 'pink', 'peach', 'mint', 'accent', 'on-pastel'] as const;
type Colors = Record<(typeof TOKENS)[number], string>;

/** Pointer position over the whole window (-1…1), so the shield reacts even when the cursor is beside the canvas. */
function usePointer() {
  const p = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const on = (e: PointerEvent) => {
      p.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      p.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', on, { passive: true });
    return () => window.removeEventListener('pointermove', on);
  }, []);
  return p;
}

function Shield({ c }: { c: Colors }) {
  const outer = useMemo(() => new THREE.ExtrudeGeometry(shieldShape(), { depth: 0.62, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3, curveSegments: 32 }), []);
  const panel = useMemo(() => new THREE.ExtrudeGeometry(shieldShape(0.2), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 32 }), []);
  const z = useMemo(() => new THREE.ExtrudeGeometry(zShape(1.25), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 2 }), []);
  useEffect(() => () => [outer, panel, z].forEach((g) => g.dispose()), [outer, panel, z]);
  return (
    <group>
      {/* body: caps pink, sides navy */}
      <mesh geometry={outer} position={[0, 0, -0.31]}>
        <meshStandardMaterial attach="material-0" color={c.pink} roughness={0.55} />
        <meshStandardMaterial attach="material-1" color={c.accent} roughness={0.5} />
        <Edges threshold={28} color={c['on-pastel']} />
      </mesh>
      {/* glass panel */}
      <mesh geometry={panel} position={[0, 0.02, 0.36]}>
        <meshPhysicalMaterial attach="material-0" color={c.mint} roughness={0.25} clearcoat={1} clearcoatRoughness={0.2} />
        <meshStandardMaterial attach="material-1" color={c.lavender} roughness={0.5} />
        <Edges threshold={28} color={c['on-pastel']} />
      </mesh>
      {/* Z emblem */}
      <mesh geometry={z} position={[0, 0.14, 0.46]}>
        <meshStandardMaterial attach="material-0" color={c.accent} roughness={0.35} metalness={0.15} />
        <meshStandardMaterial attach="material-1" color={c.lavender} roughness={0.5} />
        <Edges threshold={20} color={c['on-pastel']} />
      </mesh>
    </group>
  );
}

function OrbitTiles({ c }: { c: Colors }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.25;
  });
  const tiles: { r: number; a: number; y: number; color: string; s: number }[] = [
    { r: 2.55, a: 0, y: 0.6, color: c.mint, s: 0.38 },
    { r: 2.4, a: 2.1, y: -0.4, color: c.lavender, s: 0.3 },
    { r: 2.7, a: 4.2, y: 1.2, color: c.peach, s: 0.34 },
  ];
  return (
    <group ref={g}>
      {tiles.map((t, i) => (
        <Float key={i} speed={2 + i * 0.4} rotationIntensity={1.2} floatIntensity={0.8}>
          <RoundedBox args={[t.s, t.s * 0.32, t.s]} radius={0.04} position={[Math.cos(t.a) * t.r, t.y, Math.sin(t.a) * t.r]} rotation={[0.4, t.a, 0.2]}>
            <meshStandardMaterial color={t.color} roughness={0.6} />
            <Edges threshold={15} color={c['on-pastel']} />
          </RoundedBox>
        </Float>
      ))}
    </group>
  );
}

function Rig({ c }: { c: Colors }) {
  const g = useRef<THREE.Group>(null);
  const pointer = usePointer();
  useFrame(() => {
    if (!g.current) return;
    g.current.rotation.y = THREE.MathUtils.lerp(g.current.rotation.y, -0.6 + pointer.current.x * 0.35, 0.06);
    g.current.rotation.x = THREE.MathUtils.lerp(g.current.rotation.x, 0.14 + pointer.current.y * 0.12, 0.06);
  });
  return (
    <group ref={g} scale={0.9} position={[0, 0.1, 0]}>
      <Float speed={1.4} rotationIntensity={0.2} floatIntensity={0.7} floatingRange={[-0.08, 0.12]}>
        <Shield c={c} />
      </Float>
      <OrbitTiles c={c} />
      <ContactShadows position={[0, -2.1, 0]} scale={5} blur={3} far={3} opacity={0.22} resolution={256} color={c['on-pastel']} />
    </group>
  );
}

export default function HeroShield3D({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const on = useOnScreen(host);
  const c = useCssColors(TOKENS);
  return (
    <div ref={host} className={className} role="img" aria-label="The Zoro gateway: a 3D shield">
      {c && (
        <Canvas flat frameloop={on ? 'always' : 'never'} dpr={[1, 1.75]} camera={{ position: [0, 1.2, 8.6], fov: 36 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
          <ambientLight intensity={1.6} />
          <directionalLight position={[3, 5, 5]} intensity={1.6} />
          <directionalLight position={[-4, 1, -3]} intensity={0.5} />
          <Rig c={c} />
        </Canvas>
      )}
    </div>
  );
}
