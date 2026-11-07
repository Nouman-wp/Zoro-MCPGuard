import * as THREE from 'three';

/*
 * The Zoro outlines, taken from the 2D SVG drawings so the 3D and 2D versions match exactly.
 * SVG space is y-down around (200, 193) for the shield and (16, 16) for the Z; three.js is y-up, in scene units.
 */

const sx = (x: number) => (x - 200) / 100;
const sy = (y: number) => -(y - 193) / 100;

/** The shield silhouette: M200 26 L332 74 V176 C332 262 276 330 200 360 C124 330 68 262 68 176 V74 Z */
export function shieldShape(inset = 0) {
  // inset shrinks the outline toward the centre (used for the inner glass panel)
  const k = 1 - inset;
  const X = (x: number) => sx(200 + (x - 200) * k);
  const Y = (y: number) => sy(193 + (y - 193) * k);
  const s = new THREE.Shape();
  s.moveTo(X(200), Y(26));
  s.lineTo(X(332), Y(74));
  s.lineTo(X(332), Y(176));
  s.bezierCurveTo(X(332), Y(262), X(276), Y(330), X(200), Y(360));
  s.bezierCurveTo(X(124), Y(330), X(68), Y(262), X(68), Y(176));
  s.lineTo(X(68), Y(74));
  s.closePath();
  return s;
}

/** The angled Z mark: M6 4h22.5L15 22h10.5L22 28H3.5L17 10H2.5Z (a 32-unit box), scaled to `size` scene units. */
export function zShape(size = 1.6) {
  const pts: [number, number][] = [[6, 4], [28.5, 4], [15, 22], [25.5, 22], [22, 28], [3.5, 28], [17, 10], [2.5, 10]];
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => {
    const px = ((x - 16) / 32) * size;
    const py = (-(y - 16) / 32) * size;
    if (i === 0) s.moveTo(px, py);
    else s.lineTo(px, py);
  });
  s.closePath();
  return s;
}
