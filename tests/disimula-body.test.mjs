/**
 * Disimulá: el cuerpo es UNA sola pieza. La piel es continua entre los huesos (sin grietas ni tubos abiertos al doblarse),
 * cada pose apoya en el piso, el atlas de pintura queda cubierto sin huecos y el cuerpo visible coincide con lo que
 * valida el servidor (los proxies de colisión).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATLAS, PARTS, POSES, POSE_IDS, REGIONS, bodyMesh, skinBody, transforms, blendPose, sampleBody, raycastBody, closestBodyPoint, atlasOwner, inRegion, texelToUv, sectionAtY,
} from '/games/disimula/shared/body.js';

const REST_STATE = { pos: [0, 0, 0], yaw: 0, poseDef: { rootY: 0, rootRX: 0, bones: {} }, joints: [] }; // el cuerpo en reposo, sin ningún giro
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

/** Grupos de vértices que coinciden en el reposo y pertenecen a partes distintas: las articulaciones. */
function joints(mesh) {
  const pos = new Float32Array(mesh.n * 3);
  skinBody(mesh, REST_STATE, pos, new Float32Array(mesh.n * 3));
  // agrupa por distancia (unión de vértices a menos de 0,02 mm), sin redondear a una grilla
  const root = Array.from({ length: mesh.n }, (_, i) => i);
  const find = (i) => {
    while (root[i] !== i) i = root[i] = root[root[i]];
    return i;
  };
  for (let a = 0; a < mesh.n; a++)
    for (let b = a + 1; b < mesh.n; b++)
      if (Math.abs(pos[a * 3] - pos[b * 3]) < 2e-5 && Math.abs(pos[a * 3 + 1] - pos[b * 3 + 1]) < 2e-5 && Math.abs(pos[a * 3 + 2] - pos[b * 3 + 2]) < 2e-5) root[find(b)] = find(a);
  const groups = new Map();
  for (let k = 0; k < mesh.n; k++) (groups.get(find(k)) || groups.set(find(k), []).get(find(k))).push(k);
  return [...groups.values()].filter((g) => new Set(g.map((k) => mesh.part[k])).size > 1);
}

const JOINED = [
  ['head', 'torso'], ['torso', 'hips'],
  ['uarmL', 'foreL'], ['foreL', 'handL'], ['uarmR', 'foreR'], ['foreR', 'handR'],
  ['thighL', 'shinL'], ['shinL', 'footL'], ['thighR', 'shinR'], ['shinR', 'footR'],
];

for (const detail of [1, 0]) {
  test(`cuerpo (detalle ${detail}): cada articulación une las dos partes por un anillo completo y la piel no se abre en ninguna pose`, () => {
    const mesh = bodyMesh(detail);
    const gs = joints(mesh);
    // las 10 uniones existen, cada una con todos los lados del anillo
    for (const [a, b] of JOINED) {
      const ia = PARTS.findIndex((p) => p.id === a);
      const ib = PARTS.findIndex((p) => p.id === b);
      const n = gs.filter((g) => g.some((k) => mesh.part[k] === ia) && g.some((k) => mesh.part[k] === ib)).length;
      assert.ok(n >= (detail ? 14 : 10), `${a} y ${b} comparten un anillo completo (${n} vértices unidos)`);
    }
    // deformada con cualquier pose, ajuste fino y animación, la piel sigue cerrada (menos que el redondeo de float32)
    const pos = new Float32Array(mesh.n * 3);
    const nor = new Float32Array(mesh.n * 3);
    const r = rng(11);
    let worst = 0;
    for (const pose of POSE_IDS)
      for (let trial = 0; trial < 8; trial++) {
        const st = { pos: [3, 0, -2], yaw: r() * 6, pose, joints: Array.from({ length: 6 }, () => (trial ? r() * 2 - 1 : 0)) };
        if (trial > 4) st.anim = { thighL: [r() - 0.5, 0, 0], shinL: [r(), 0, 0], uarmR: [r() - 0.5, 0, r() - 0.5], foreL: [-r(), 0, 0], footR: [r() - 0.5, 0, 0], root: [0, r() * 0.2, r() * 0.1], _y: -0.02 };
        skinBody(mesh, st, pos, nor);
        for (const g of gs)
          for (const k of g) worst = Math.max(worst, Math.hypot(pos[k * 3] - pos[g[0] * 3], pos[k * 3 + 1] - pos[g[0] * 3 + 1], pos[k * 3 + 2] - pos[g[0] * 3 + 2]));
        for (let k = 0; k < mesh.n * 3; k++) assert.ok(Number.isFinite(pos[k]) && Number.isFinite(nor[k]), `sin NaN en ${pose}`);
      }
    assert.ok(worst < 2e-5, `grieta máxima ${worst.toExponential(2)} m`); // float32: el redondeo está en el orden de 1e-6
  });
}

test('cuerpo: todas las normales son unitarias y miran hacia afuera', () => {
  const mesh = bodyMesh(1);
  const pos = new Float32Array(mesh.n * 3);
  const nor = new Float32Array(mesh.n * 3);
  skinBody(mesh, REST_STATE, pos, nor);
  let inward = 0;
  for (let k = 0; k < mesh.n; k++) {
    assert.ok(Math.abs(Math.hypot(nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]) - 1) < 1e-3, 'normal unitaria');
    // hacia afuera: sigue la dirección que va del eje de la parte (en el espacio de su hueso) al vértice
    const x = mesh.q0[k * 3];
    const z = mesh.q0[k * 3 + 2];
    if (Math.hypot(x, z) > 0.02 && mesh.n0[k * 3] * x + mesh.n0[k * 3 + 2] * z < -0.02) inward++;
  }
  assert.ok(inward / mesh.n < 0.01, `normales hacia adentro: ${inward}`);
});

test('cuerpo: cada pose apoya en el piso (ni flota ni lo atraviesa) y la cadera también se apoya sentado', () => {
  const mesh = bodyMesh(1);
  const pos = new Float32Array(mesh.n * 3);
  for (const pose of POSE_IDS) {
    skinBody(mesh, { pos: [0, 0, 0], yaw: 0, pose, joints: [] }, pos, new Float32Array(mesh.n * 3));
    let lo = Infinity;
    for (let k = 0; k < mesh.n; k++) lo = Math.min(lo, pos[k * 3 + 1]);
    assert.ok(lo > -0.006 && lo < 0.012, `${pose}: el punto más bajo está a ${(lo * 100).toFixed(1)} cm del piso`);
  }
  // sentado: la cadera y los talones tocan juntos (no queda sentado en el aire)
  skinBody(mesh, { pos: [0, 0, 0], yaw: 0, pose: 'sit', joints: [] }, pos, new Float32Array(mesh.n * 3));
  const low = (id) => {
    let lo = Infinity;
    const pi = PARTS.findIndex((p) => p.id === id);
    for (let k = 0; k < mesh.n; k++) if (mesh.part[k] === pi) lo = Math.min(lo, pos[k * 3 + 1]);
    return lo;
  };
  assert.ok(Math.abs(low('hips') - Math.min(low('footL'), low('shinL'))) < 0.012, 'cadera y talones a la misma altura');
});

test('cuerpo: el atlas queda cubierto sin huecos ni repetidos y la cara cae donde están los ojos', () => {
  const owner = atlasOwner();
  let cells = 0;
  for (const o of owner) if (o >= 0) cells++;
  const st = { pos: [0, 0, 0], yaw: 0, pose: 'stand', joints: [] };
  const s = sampleBody(st, 1, 1);
  assert.equal(s.length, cells, 'una muestra por texel del atlas');
  assert.equal(new Set(s.map((p) => p.ty * ATLAS + p.tx)).size, cells, 'sin texels repetidos');
  for (const p of s) assert.ok(Math.abs(Math.hypot(p.nx, p.ny, p.nz) - 1) < 1e-3, 'normal unitaria');
  // la región "cara" (balde) incluye el punto de la cabeza justo debajo de los ojos, mirando de frente
  const face = REGIONS.find((r) => r.id === 'face');
  const head = tf(st).bones[2].p; // la base del cuello
  const eyeY = head[1] + 0.235;
  const hit = s.filter((p) => PARTS[p.part].id === 'head' && p.nz > 0.8 && Math.abs(p.x) < 0.03 && Math.abs(p.y - eyeY) < 0.012);
  assert.ok(hit.length > 0, 'hay texels de la cabeza al frente, a la altura de los ojos');
  for (const p of hit) {
    const [u, v] = texelToUv(PARTS[p.part], p.tx, p.ty);
    assert.ok(inRegion(face, 'head', u, v), 'ese texel es de la cara');
  }
  assert.ok(sectionAtY('head', 0.235), 'el perfil de la cabeza responde a la altura de los ojos');
});
const tf = (st) => transforms(st);

test('cuerpo: la piel visible queda dentro de los proxies de colisión del servidor (con unos centímetros de margen)', () => {
  const mesh = bodyMesh(1);
  const pos = new Float32Array(mesh.n * 3);
  for (const pose of POSE_IDS) {
    const st = { pos: [0, 0, 0], yaw: 0.4, pose, joints: [] };
    skinBody(mesh, st, pos, new Float32Array(mesh.n * 3));
    const T = transforms(st).parts;
    for (let k = 0; k < mesh.n; k++) {
      const pi = mesh.part[k];
      const part = PARTS[pi];
      const t = T[pi];
      const M = (v) => [t.m[0] * v[0] + t.m[1] * v[1] + t.m[2] * v[2] + t.p[0], t.m[3] * v[0] + t.m[4] * v[1] + t.m[5] * v[2] + t.p[1], t.m[6] * v[0] + t.m[7] * v[1] + t.m[8] * v[2] + t.p[2]];
      let a;
      let b;
      let r;
      if (part.shape === 'sph') [a, b, r] = [M(part.c), M(part.c), part.r];
      else if (part.shape === 'cap') [a, b, r] = [M(part.a), M(part.b), part.r];
      else [a, b, r] = [M(part.c), M(part.c), Math.max(...part.s) / 2];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      let u = l2 ? ((pos[k * 3] - a[0]) * ab[0] + (pos[k * 3 + 1] - a[1]) * ab[1] + (pos[k * 3 + 2] - a[2]) * ab[2]) / l2 : 0;
      u = Math.max(0, Math.min(1, u));
      const d = Math.hypot(pos[k * 3] - a[0] - ab[0] * u, pos[k * 3 + 1] - a[1] - ab[1] * u, pos[k * 3 + 2] - a[2] - ab[2] * u) - r;
      // la antena es adorno: la cabeza admite hasta 9 cm; el resto del cuerpo, 3 cm
      assert.ok(d < (part.id === 'head' ? 0.09 : 0.03), `${part.id} en ${pose} sobresale ${(d * 100).toFixed(1)} cm de su proxy`);
    }
  }
});

test('cuerpo: el rayo pega en la parte que se ve (de frente en la cabeza, el torso y el pie)', () => {
  const st = { pos: [0, 0, 0], yaw: 0, pose: 'stand', joints: [] };
  const id = (h) => PARTS[h.part].id;
  assert.equal(id(raycastBody(st, 0, 1.69, 3, 0, 0, -1)), 'head', 'a la altura de los ojos pega en la cabeza');
  assert.equal(id(raycastBody(st, 0, 1.2, 3, 0, 0, -1)), 'torso');
  const foot = raycastBody(st, 0.115, 0.05, 3, 0, 0, -1); // horizontal, a la altura del pie izquierdo
  assert.equal(id(foot), 'footL', `de frente, a la altura del pie (pegó en ${id(foot)})`);
  assert.equal(raycastBody(st, 3, 1.2, 3, 0, 0, -1), null, 'al costado, no pega');
  const lie = { pos: [0, 0, 0], yaw: 0, pose: 'lie', joints: [] };
  assert.ok(raycastBody(lie, 0, 3, 0, 0, -1, 0), 'acostado se lo ve desde arriba');
  assert.equal(raycastBody(lie, 0, 1.2, 3, 0, 0, -1), null, 'acostado ya no está a la altura del torso de pie');
});

test('cuerpo: las transiciones entre poses son continuas y terminan exactamente en la pose elegida', () => {
  for (const a of POSE_IDS)
    for (const b of POSE_IDS) {
      const start = blendPose(a, b, 0);
      const end = blendPose(a, b, 1);
      assert.ok(Math.abs(start.rootY - POSES[a].rootY) < 1e-12 && Math.abs(end.rootY - POSES[b].rootY) < 1e-12, `${a}→${b}: extremos`);
      assert.ok(Math.abs(end.rootRX - POSES[b].rootRX) < 1e-12);
      let prev = start;
      for (let k = 1; k <= 20; k++) {
        const cur = blendPose(a, b, k / 20);
        assert.ok(Math.abs(cur.rootY - prev.rootY) < 0.2 && Math.abs(cur.rootRX - prev.rootRX) < 0.2, `${a}→${b}: sin saltos`);
        const tfm = transforms({ pos: [0, 0, 0], yaw: 0, poseDef: cur, joints: [] });
        assert.ok(tfm.bones.every((t) => t.m.every(Number.isFinite) && t.p.every(Number.isFinite)), `${a}→${b}: sin NaN`);
        prev = cur;
      }
    }
});

test('cuerpo: el servidor sigue capturando por los proxies (la cabeza más grande no cambia las reglas)', () => {
  // a 2,3 m de frente y a la altura de la cara se puede capturar; a 4 m, no
  const st = { pos: [0, 0, 0], yaw: 0, pose: 'stand', joints: [] };
  assert.ok(closestBodyPoint(st, 0, 1.6, 2.3).d < 2.5);
  assert.ok(closestBodyPoint(st, 0, 1.6, 4).d > 2.5);
});
