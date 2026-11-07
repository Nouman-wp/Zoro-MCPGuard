'use client';

/**
 * Procedural scenes: no model files. Everything is instanced geometry and standard materials, so the whole 3D layer
 * costs kilobytes instead of megabytes.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera, View } from '@react-three/drei';
import * as THREE from 'three';
import { scrollStore } from '../runtime';
import { complete } from './loading';

// Verdict palette, as linear-space THREE colours.
const C = {
  unknown: new THREE.Color('#94a3b8'),
  scan: new THREE.Color('#22d3ee'),
  seal: new THREE.Color('#4ade80'),
  block: new THREE.Color('#f87171'),
  trust: new THREE.Color('#3b82f6'),
  ledger: new THREE.Color('#e2e8f0'),
  human: new THREE.Color('#c4b5fd'),
  ask: new THREE.Color('#fbbf24'),
};

// ---------- Hero: the Gate ----------

const COUNT = 220;
const SPAN = 7.5; // particles travel from -SPAN to +SPAN on x
const GATE_HALF = 0.32;

interface P {
  x: number;
  y: number;
  z: number;
  speed: number;
  bad: boolean;
  fall: number; // set once a blocked call hits the gate
}

function seedParticles(): P[] {
  // Deterministic pseudo-random so every visit looks the same (and nothing depends on Math.random during render).
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: COUNT }, () => {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 1.15;
    return { x: -SPAN + rnd() * SPAN * 2, y: Math.sin(a) * r, z: Math.cos(a) * r, speed: 0.9 + rnd() * 0.9, bad: rnd() < 0.12, fall: 0 };
  });
}

function Gate() {
  const group = useRef<THREE.Group>(null);
  const rings = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const parts = useMemo(seedParticles, []);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const first = useRef(true);

  useLayoutEffect(() => {
    parts.forEach((_, i) => mesh.current!.setColorAt(i, C.unknown));
  }, [parts]);

  useFrame((state, dt) => {
    const d = Math.min(dt, 1 / 30);
    const t = state.clock.elapsedTime;
    const g = group.current!;
    // Pointer parallax and the hero scroll-out.
    g.rotation.y += (scrollStore.pointerX * 0.25 - 0.35 - g.rotation.y) * 0.05;
    g.rotation.x += (-scrollStore.pointerY * 0.15 - g.rotation.x) * 0.05;
    g.position.y = scrollStore.gate * 2.4;
    const s = 1 - scrollStore.gate * 0.25;
    g.scale.setScalar(s);
    rings.current!.children.forEach((r, i) => (r.rotation.z = t * (0.12 + i * 0.07) * (i % 2 ? -1 : 1)));

    for (let i = 0; i < COUNT; i++) {
      const p = parts[i];
      if (p.fall > 0) {
        // Blocked: it never passes the gate; it drops and fades out, then a new call arrives.
        p.fall += d;
        p.y -= d * 2.2 * p.fall;
        p.x -= d * 0.4;
        if (p.fall > 1.4) Object.assign(p, { x: -SPAN, fall: 0 });
      } else {
        p.x += p.speed * d * 1.6;
        if (p.bad && p.x > -GATE_HALF) p.fall = 0.001;
        if (p.x > SPAN) p.x = -SPAN;
      }
      const inGate = Math.abs(p.x) < GATE_HALF + 0.25;
      if (p.fall > 0) col.copy(C.block);
      else if (inGate) col.copy(C.scan);
      else if (p.x > 0) col.copy(C.seal);
      else col.copy(C.unknown);
      mesh.current!.setColorAt(i, col);
      const size = p.fall > 0 ? Math.max(0, 1 - p.fall / 1.4) : inGate ? 1.6 : 1;
      // Calls bunch up into the gate's opening, then spread out again.
      const pinch = 1 - 0.55 * Math.exp(-(p.x * p.x) / 3);
      tmp.position.set(p.x, p.y * pinch, p.z * pinch);
      tmp.scale.setScalar(0.045 * size);
      tmp.updateMatrix();
      mesh.current!.setMatrixAt(i, tmp.matrix);
    }
    mesh.current!.instanceMatrix.needsUpdate = true;
    if (mesh.current!.instanceColor) mesh.current!.instanceColor.needsUpdate = true;
    if (first.current) {
      first.current = false;
      complete('frame');
    }
  });

  return (
    <group ref={group}>
      {/* The gate frame. */}
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1.55, 0.05, 24, 160]} />
        <meshStandardMaterial color="#1b2940" metalness={0.85} roughness={0.25} emissive={C.trust} emissiveIntensity={0.35} />
      </mesh>
      {/* Four inner rings: Sentinel's four layers. */}
      <group ref={rings} rotation={[0, Math.PI / 2, 0]}>
        {[1.32, 1.18, 1.04, 0.9].map((r, i) => (
          <mesh key={r} position={[0, 0, (i - 1.5) * 0.11]}>
            <torusGeometry args={[r, 0.012, 8, 120, Math.PI * (1.25 + i * 0.15)]} />
            <meshBasicMaterial color={C.scan} transparent opacity={0.55 - i * 0.08} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {/* The scan plane inside the gate. */}
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[1.5, 64]} />
        <meshBasicMaterial color={C.scan} transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

export function GateView({ className }: { className?: string }) {
  return (
    <View className={className}>
      <PerspectiveCamera makeDefault position={[0, 0.3, 8.5]} fov={34} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 4, 5]} intensity={1.4} />
      <pointLight position={[-3, -2, 2]} intensity={6} color="#22d3ee" />
      <Gate />
    </View>
  );
}

// ---------- Proof: the exploded Seal ----------

/** Bottom to top, the layers a Seal is made of (VerdictPackage + its publication). */
export const SEAL_LAYERS = [
  { id: 'fingerprint', color: C.scan },
  { id: 'verdict', color: C.seal },
  { id: 'capabilities', color: C.unknown },
  { id: 'attestation', color: C.trust },
  { id: 'ens', color: C.ledger },
  { id: 'hedera', color: C.ledger },
] as const;

function SealStack() {
  const group = useRef<THREE.Group>(null);
  const layers = useRef<(THREE.Group | null)[]>([]);
  useFrame((state) => {
    const p = THREE.MathUtils.smoothstep(scrollStore.seal, 0.05, 0.75);
    const g = group.current!;
    g.rotation.y = state.clock.elapsedTime * 0.18 + scrollStore.pointerX * 0.3;
    layers.current.forEach((l, i) => {
      if (!l) return;
      const n = SEAL_LAYERS.length;
      l.position.y = (i - (n - 1) / 2) * (0.09 + p * 0.72);
      l.rotation.y = p * (i - (n - 1) / 2) * 0.22;
    });
  });
  return (
    <group rotation={[0.55, 0, 0]}>
      <group ref={group}>
        {SEAL_LAYERS.map((l, i) => (
          <group key={l.id} ref={(el) => void (layers.current[i] = el)}>
            <mesh>
              <cylinderGeometry args={[1.35 - i * 0.04, 1.35 - i * 0.04, 0.07, 6 + (i % 2) * 2, 1]} />
              <meshStandardMaterial color="#141e30" metalness={0.75} roughness={0.32} transparent opacity={0.92} />
            </mesh>
            <mesh>
              <torusGeometry args={[1.36 - i * 0.04, 0.012, 6, 96]} />
              <meshBasicMaterial color={l.color} toneMapped={false} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
              <ringGeometry args={[0.3, 0.34, 48]} />
              <meshBasicMaterial color={l.color} transparent opacity={0.6} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

export function SealView({ className }: { className?: string }) {
  return (
    <View className={className}>
      <PerspectiveCamera makeDefault position={[0, 0.2, 7.2]} fov={34} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 5, 4]} intensity={1.6} />
      <pointLight position={[-3, 1, 3]} intensity={8} color="#3b82f6" />
      <SealStack />
    </View>
  );
}
