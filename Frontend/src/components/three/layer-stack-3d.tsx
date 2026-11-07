'use client';

/**
 * "How it works" in 3D: six isometric plates, one per layer of the pipeline, each carrying its own object.
 * `explode` (0…1, from scroll) pulls the plates apart; `active` (index) lifts and outlines one plate.
 * Both arrive through refs so scrolling never re-renders React, only the next frame.
 */
import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Edges, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { zShape } from './shapes';
import { useCssColors, useOnScreen } from './use-scene';

const TOKENS = ['lavender', 'pink', 'peach', 'mint', 'accent', 'on-pastel', 'surface'] as const;
type Colors = Record<(typeof TOKENS)[number], string>;
export type PlateTone = 'lavender' | 'pink' | 'peach' | 'mint' | 'plain';

const damp = THREE.MathUtils.damp;

// ---------- the six objects ----------

function Agent({ c }: { c: Colors }) {
  return (
    <group>
      <RoundedBox args={[0.9, 0.7, 0.75]} radius={0.12} position={[0, 0.45, 0]}>
        <meshStandardMaterial color={c.lavender} roughness={0.5} />
        <Edges threshold={20} color={c['on-pastel']} />
      </RoundedBox>
      {[-0.2, 0.2].map((x) => (
        <mesh key={x} position={[x, 0.5, 0.38]}>
          <sphereGeometry args={[0.08, 20, 20]} />
          <meshStandardMaterial color={c.accent} />
        </mesh>
      ))}
      <mesh position={[0, 0.92, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.25]} />
        <meshStandardMaterial color={c['on-pastel']} />
      </mesh>
      <mesh position={[0, 1.08, 0]}>
        <sphereGeometry args={[0.08, 20, 20]} />
        <meshStandardMaterial color={c.pink} />
      </mesh>
    </group>
  );
}

function Gateway({ c }: { c: Colors }) {
  const z = useMemo(() => new THREE.ExtrudeGeometry(zShape(0.42), { depth: 0.08, bevelEnabled: false }), []);
  useEffect(() => () => z.dispose(), [z]);
  return (
    <group>
      {[-0.42, 0.42].map((x) => (
        <RoundedBox key={x} args={[0.2, 0.9, 0.3]} radius={0.04} position={[x, 0.45, 0]}>
          <meshStandardMaterial color={c.accent} roughness={0.5} />
          <Edges threshold={20} color={c['on-pastel']} />
        </RoundedBox>
      ))}
      <RoundedBox args={[1.1, 0.26, 0.34]} radius={0.05} position={[0, 1.0, 0]}>
        <meshStandardMaterial color={c.accent} roughness={0.5} />
        <Edges threshold={20} color={c['on-pastel']} />
      </RoundedBox>
      <mesh geometry={z} position={[0, 0.48, 0.02]}>
        <meshStandardMaterial color={c.pink} roughness={0.4} />
        <Edges threshold={20} color={c['on-pastel']} />
      </mesh>
    </group>
  );
}

function Sentinel({ c }: { c: Colors }) {
  const beam = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (beam.current) beam.current.rotation.y += dt * 1.4;
  });
  return (
    <group>
      <mesh position={[0, 0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.36, 0.08, 16, 48]} />
        <meshStandardMaterial color={c.accent} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshPhysicalMaterial color={c.mint} roughness={0.1} clearcoat={1} transmission={0.3} thickness={0.5} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.06, 0.12, 0.3]} />
        <meshStandardMaterial color={c.accent} />
      </mesh>
      <group ref={beam} position={[0, 0.55, 0]}>
        <mesh position={[0.75, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.32, 1.0, 32, 1, true]} />
          <meshBasicMaterial color={c.mint} transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

function NameTags({ c }: { c: Colors }) {
  const colors = [c.surface, c.mint, c.lavender];
  return (
    <group>
      {colors.map((col, i) => (
        <group key={i} position={[i * 0.12 - 0.12, 0.12 + i * 0.16, i * -0.1]} rotation={[-0.15, 0.2 - i * 0.12, 0]}>
          <RoundedBox args={[1.0, 0.1, 0.62]} radius={0.04}>
            <meshStandardMaterial color={col} roughness={0.55} />
            <Edges threshold={20} color={c['on-pastel']} />
          </RoundedBox>
          <mesh position={[-0.36, 0.06, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.02, 20]} />
            <meshStandardMaterial color={c['on-pastel']} />
          </mesh>
          {[0, 1].map((r) => (
            <mesh key={r} position={[0.08, 0.06, -0.1 + r * 0.18]}>
              <boxGeometry args={[0.5 - r * 0.15, 0.01, 0.06]} />
              <meshStandardMaterial color={c.accent} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Ledger({ c }: { c: Colors }) {
  const pulse = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (pulse.current) pulse.current.position.x = -0.66 + ((clock.elapsedTime * 0.6) % 1) * 1.32;
  });
  const blocks = [-0.66, 0, 0.66];
  return (
    <group position={[0, 0.3, 0]}>
      {blocks.map((x, i) => (
        <RoundedBox key={x} args={[0.42, 0.42, 0.42]} radius={0.05} position={[x, 0, 0]}>
          <meshStandardMaterial color={i === 1 ? c.surface : c.peach} roughness={0.55} />
          <Edges threshold={20} color={c['on-pastel']} />
        </RoundedBox>
      ))}
      {[-0.33, 0.33].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, 0.25]} />
          <meshStandardMaterial color={c['on-pastel']} />
        </mesh>
      ))}
      <mesh ref={pulse} position={[0, 0.32, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial color={c.accent} emissive={c.accent} emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function Orb({ c }: { c: Colors }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ring.current) {
      ring.current.rotation.z += dt * 0.8;
      ring.current.rotation.x += dt * 0.3;
    }
  });
  return (
    <group position={[0, 0.6, 0]}>
      <mesh>
        <sphereGeometry args={[0.42, 48, 48]} />
        <meshPhysicalMaterial color={c.lavender} roughness={0.15} clearcoat={1} sheen={1} sheenColor={c.pink} />
      </mesh>
      <mesh ref={ring} rotation={[1.2, 0, 0]}>
        <torusGeometry args={[0.62, 0.025, 12, 64]} />
        <meshStandardMaterial color={c.accent} />
      </mesh>
      <mesh position={[0, 0, 0.41]}>
        <circleGeometry args={[0.1, 32]} />
        <meshBasicMaterial color={c['on-pastel']} />
      </mesh>
    </group>
  );
}

const OBJECTS: ((p: { c: Colors }) => ReactNode)[] = [Agent, Gateway, Sentinel, NameTags, Ledger, Orb];

// ---------- plates ----------

function Layer({ i, n, c, tone, explode, active }: { i: number; n: number; c: Colors; tone: PlateTone; explode: MutableRefObject<number>; active: MutableRefObject<number> }) {
  const g = useRef<THREE.Group>(null);
  const obj = useRef<THREE.Group>(null);
  const Obj = OBJECTS[i];
  useFrame(({ clock }, dt) => {
    if (!g.current || !obj.current) return;
    const gap = THREE.MathUtils.lerp(0.34, 1.4, explode.current);
    const on = active.current === i;
    const target = ((n - 1) / 2 - i) * gap + (on ? 0.1 : 0);
    g.current.position.y = damp(g.current.position.y, target, 6, dt);
    const s = damp(g.current.scale.x, on ? 1.06 : 1, 6, dt);
    g.current.scale.setScalar(s);
    obj.current.rotation.y += dt * (on ? 0.9 : 0.25);
    obj.current.position.y = 0.08 + Math.sin(clock.elapsedTime * 1.5 + i) * 0.04;
    // objects fade in as the plates separate, so the closed stack reads as one block
    obj.current.visible = explode.current > 0.15;
  });
  const color = tone === 'plain' ? c.surface : c[tone];
  return (
    <group ref={g}>
      <RoundedBox args={[1.85, 0.14, 1.85]} radius={0.05} rotation={[0, Math.PI / 4, 0]}>
        <meshStandardMaterial color={color} roughness={0.6} />
        <Edges threshold={15} color={c['on-pastel']} />
      </RoundedBox>
      <group ref={obj} scale={0.78}>
        <Obj c={c} />
      </group>
    </group>
  );
}

export default function LayerStack3D({ tones, explode, active, className }: { tones: PlateTone[]; explode: MutableRefObject<number>; active: MutableRefObject<number>; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const on = useOnScreen(host);
  const c = useCssColors(TOKENS);
  return (
    <div ref={host} className={className} aria-hidden>
      {c && (
        <Canvas flat frameloop={on ? 'always' : 'never'} dpr={[1, 1.75]} camera={{ position: [8.6, 5.0, 8.6], fov: 40 }} onCreated={({ camera }) => camera.lookAt(0, 0.25, 0)} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
          <ambientLight intensity={1.5} />
          <directionalLight position={[4, 8, 5]} intensity={1.5} />
          <directionalLight position={[-5, 2, -2]} intensity={0.4} />
          {tones.map((t, i) => (
            <Layer key={i} i={i} n={tones.length} c={c} tone={t} explode={explode} active={active} />
          ))}
        </Canvas>
      )}
    </div>
  );
}
