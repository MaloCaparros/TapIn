// Personnages 3D d'un seul tenant.
//
// Le corps est décrit comme une forme lisse (fonction de distance signée, « SDF ») :
// des volumes simples (ellipsoïdes, cônes arrondis…) fusionnés en douceur, puis
// transformés en un maillage unique par l'algorithme des « surface nets ».
// Ce maillage est ensuite « skinné » sur un squelette (os du bassin, de la colonne,
// des bras, des jambes…) pour se plier proprement aux articulations.
//
// Repère local : pieds à y = 0, le personnage regarde vers +z. Unités : mètres.
import * as THREE from 'three';

// =====================================================================
// Primitives SDF
// =====================================================================
function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

// Cône arrondi entre a (rayon r1) et b (rayon r2) — d'après Inigo Quilez.
function roundCone(a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return (x, y, z) => {
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2, z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}
const ellipsoid = (c, r) => (x, y, z) => sdEllipsoid(x - c[0], y - c[1], z - c[2], r[0], r[1], r[2]);
const sphere = (c, r) => (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r;
const torusY = (c, R, r) => (x, y, z) => Math.hypot(Math.hypot(x - c[0], z - c[2]) - R, y - c[1]) - r;

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
const smax = (a, b, k) => -smin(-a, -b, k);

// =====================================================================
// Maillage par « surface nets »
// =====================================================================
function surfaceNets(sdf, min, max, cell) {
  const nx = Math.ceil((max[0] - min[0]) / cell), ny = Math.ceil((max[1] - min[1]) / cell), nz = Math.ceil((max[2] - min[2]) / cell);
  const sx = nx + 1, sxy = (nx + 1) * (ny + 1);
  const val = new Float32Array(sxy * (nz + 1));
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++)
    val[i + j * sx + k * sxy] = sdf(min[0] + i * cell, min[1] + j * cell, min[2] + k * cell);

  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const cx = nx, cxy = nx * ny;
  const corners = [];
  for (let c = 0; c < 8; c++) corners.push([c & 1, (c >> 1) & 1, (c >> 2) & 1]);
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const [a, b, d] = corners[c];
      v[c] = val[i + a + (j + b) * sx + (k + d) * sxy];
      if (v[c] < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let px = 0, py = 0, pz = 0, n = 0;
    for (const [e0, e1] of edges) {
      if ((v[e0] < 0) === (v[e1] < 0)) continue;
      const t = v[e0] / (v[e0] - v[e1]);
      const c0 = corners[e0], c1 = corners[e1];
      px += c0[0] + (c1[0] - c0[0]) * t; py += c0[1] + (c1[1] - c0[1]) * t; pz += c0[2] + (c1[2] - c0[2]) * t;
      n++;
    }
    cellVert[i + j * cx + k * cxy] = pos.length / 3;
    pos.push(min[0] + (i + px / n) * cell, min[1] + (j + py / n) * cell, min[2] + (k + pz / n) * cell);
  }

  const idx = [];
  const cv = (i, j, k) => cellVert[i + j * cx + k * cxy];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d);
  };
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const p = val[i + j * sx + k * sxy];
    const inside = p < 0;
    if (i < nx && j > 0 && k > 0 && j < ny && k < nz && inside !== (val[i + 1 + j * sx + k * sxy] < 0))
      quad(cv(i, j - 1, k - 1), cv(i, j, k - 1), cv(i, j, k), cv(i, j - 1, k), !inside);
    if (j < ny && i > 0 && k > 0 && i < nx && k < nz && inside !== (val[i + (j + 1) * sx + k * sxy] < 0))
      quad(cv(i - 1, j, k - 1), cv(i - 1, j, k), cv(i, j, k), cv(i, j, k - 1), !inside);
    if (k < nz && i > 0 && j > 0 && i < nx && j < ny && inside !== (val[i + j * sx + (k + 1) * sxy] < 0))
      quad(cv(i - 1, j - 1, k), cv(i, j - 1, k), cv(i, j, k), cv(i - 1, j, k), !inside);
  }

  // normales lisses = gradient de la SDF ; occlusion ambiante approximée en sondant le long de la normale
  const nv = pos.length / 3;
  const normals = new Float32Array(nv * 3);
  const ao = new Float32Array(nv);
  const h = cell * 0.5;
  for (let q = 0; q < nv; q++) {
    const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2];
    let gx = sdf(x + h, y, z) - sdf(x - h, y, z);
    let gy = sdf(x, y + h, z) - sdf(x, y - h, z);
    let gz = sdf(x, y, z + h) - sdf(x, y, z - h);
    const l = Math.hypot(gx, gy, gz) || 1;
    gx /= l; gy /= l; gz /= l;
    normals[q * 3] = gx; normals[q * 3 + 1] = gy; normals[q * 3 + 2] = gz;
    let occ = 0;
    for (const [dist, w] of [[0.015, 1], [0.035, 0.6], [0.07, 0.35]]) {
      occ += w * Math.max(0, dist - sdf(x + gx * dist, y + gy * dist, z + gz * dist)) / dist;
    }
    ao[q] = Math.max(0.35, 1 - occ * 0.55);
  }
  return { positions: new Float32Array(pos), normals, ao, index: idx };
}

// =====================================================================
// Anatomie
// =====================================================================
const ARM_A = 0.32; // ouverture des bras dans la pose de référence (en « A »)
export const HIP_Y = 0.72;
const HEAD_C = [0, 1.42, 0];
const sA = Math.sin(ARM_A), cA = Math.cos(ARM_A);

// Os : nom, parent, position (repère du corps, pose de référence)
const SHOULDER = [0.2, 1.12, 0];
const elbowOf = s => [s * (SHOULDER[0] + sA * 0.27), SHOULDER[1] - cA * 0.27, 0];
const wristOf = s => [s * (SHOULDER[0] + sA * 0.51), SHOULDER[1] - cA * 0.51, 0];
const along = (p, s, d) => [p[0] + s * sA * d, p[1] - cA * d, p[2]];
const BONES = [
  ['hips', -1, [0, HIP_Y, 0]],
  ['spine', 0, [0, 0.82, 0]],
  ['chest', 1, [0, 1.0, 0]],
  ['neck', 2, [0, 1.17, 0]],
  ['head', 3, [0, 1.29, 0]],
  ['shL', 2, [SHOULDER[0], SHOULDER[1], 0]],
  ['elL', 5, elbowOf(1)],
  ['shR', 2, [-SHOULDER[0], SHOULDER[1], 0]],
  ['elR', 7, elbowOf(-1)],
  ['hipL', 0, [0.1, HIP_Y, 0]],
  ['knL', 9, [0.1, 0.42, 0.01]],
  ['hipR', 0, [-0.1, HIP_Y, 0]],
  ['knR', 11, [-0.1, 0.42, 0.01]],
];
const B = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

// Régions de couleur
const R = { skin: 0, coat: 1, pants: 2, cuff: 3, boots: 4, scarf: 5, tail: 6, lip: 7 };

function bodyPrims() {
  const P = [];
  const add = (f, bone, region, k) => P.push({ f, bone: B[bone], region: R[region], k, op: 'add' });
  // tronc
  add(ellipsoid([0, 0.75, 0], [0.165, 0.1, 0.12]), 'hips', 'pants', 0.04);
  add(ellipsoid([0, 0.88, 0.005], [0.17, 0.14, 0.12]), 'spine', 'coat', 0.07);
  add(ellipsoid([0, 1.04, 0.0], [0.2, 0.15, 0.13]), 'chest', 'coat', 0.07);
  add(ellipsoid([0, 1.0, 0.05], [0.15, 0.1, 0.09]), 'chest', 'coat', 0.05);
  add(ellipsoid([0, 0.71, -0.075], [0.165, 0.15, 0.065]), 'hips', 'tail', 0.03);
  for (const s of [1, -1]) {
    add(roundCone([s * 0.06, 1.13, -0.005], [s * 0.19, 1.115, 0], 0.07, 0.068), 'chest', 'coat', 0.06);
    // bras
    const sh = [s * SHOULDER[0], SHOULDER[1], 0], el = elbowOf(s), wr = wristOf(s);
    const side = s > 0 ? 'L' : 'R';
    add(roundCone(sh, el, 0.062, 0.052), 'sh' + side, 'coat', 0.035);
    add(roundCone(el, wr, 0.05, 0.041), 'el' + side, 'coat', 0.025);
    add(roundCone(along(el, s, 0.18), wr, 0.054, 0.05), 'el' + side, 'cuff', 0.01);
    const hand = along(wr, s, 0.07);
    add(ellipsoid(hand, [0.03, 0.058, 0.042]), 'el' + side, 'skin', 0.02);
    add(roundCone(along([wr[0], wr[1], wr[2] + 0.025], s, 0.015), along([wr[0], wr[1], wr[2] + 0.055], s, 0.055), 0.016, 0.013), 'el' + side, 'skin', 0.012);
    // jambes
    const hip = [s * 0.1, HIP_Y, 0], knee = [s * 0.1, 0.42, 0.01], ankle = [s * 0.1, 0.1, 0];
    add(roundCone(hip, knee, 0.08, 0.06), 'hip' + side, 'pants', 0.05);
    add(roundCone(knee, ankle, 0.057, 0.045), 'kn' + side, 'pants', 0.03);
    add(roundCone([s * 0.1, 0.25, 0.0], [s * 0.1, 0.12, 0], 0.065, 0.062), 'kn' + side, 'cuff', 0.012);
    const boot = roundCone([s * 0.1, 0.065, -0.035], [s * 0.1, 0.055, 0.12], 0.058, 0.05);
    add((x, y, z) => Math.max(boot(x, y, z), -y), 'kn' + side, 'boots', 0.015);
    add(roundCone([s * 0.1, 0.07, -0.005], [s * 0.1, 0.13, 0], 0.062, 0.06), 'kn' + side, 'boots', 0.02);
  }
  // cou, écharpe
  add(roundCone([0, 1.17, -0.01], [0, 1.31, -0.01], 0.058, 0.054), 'neck', 'skin', 0.03);
  add(torusY([0, 1.2, -0.005], 0.078, 0.05), 'chest', 'scarf', 0.02);
  add(ellipsoid([0.0, 1.16, 0.105], [0.07, 0.062, 0.045]), 'chest', 'scarf', 0.025);
  add(roundCone([0.035, 1.13, 0.12], [0.05, 0.99, 0.15], 0.04, 0.034), 'chest', 'scarf', 0.02);
  // tête
  const [hx, hy, hz] = HEAD_C;
  add(ellipsoid([hx, hy, hz], [0.19, 0.21, 0.2]), 'head', 'skin', 0.0);
  add(ellipsoid([hx, hy - 0.07, hz + 0.03], [0.162, 0.14, 0.162]), 'head', 'skin', 0.06);
  add(ellipsoid([hx, hy - 0.02, hz + 0.192], [0.024, 0.034, 0.03]), 'head', 'skin', 0.02);
  for (const s of [1, -1]) {
    add(ellipsoid([s * 0.188, hy, hz - 0.005], [0.025, 0.05, 0.035]), 'head', 'skin', 0.015);
    // orbites (creusées)
    P.push({ f: sphere([s * 0.068, hy + 0.015, 0.156], 0.034), bone: B.head, region: R.skin, k: 0.014, op: 'sub' });
  }
  return P;
}

// Teinte des joues (n'ajoute pas de volume)
const BLUSH = [1, -1].map(s => ellipsoid([s * 0.108, HEAD_C[1] - 0.045, 0.15], [0.04, 0.026, 0.035]));

let BODY = null;
function bodyData() {
  if (BODY) return BODY;
  const prims = bodyPrims();
  const adds = prims.filter(p => p.op === 'add'), subs = prims.filter(p => p.op === 'sub');
  const sdf = (x, y, z) => {
    let d = 1e9;
    for (const p of adds) d = smin(d, p.f(x, y, z), p.k);
    for (const p of subs) d = smax(d, -p.f(x, y, z), p.k);
    return d;
  };
  const m = surfaceNets(sdf, [-0.42, -0.02, -0.26], [0.42, 1.66, 0.28], 0.0115);
  const nv = m.positions.length / 3;
  const region = new Uint8Array(nv), region2 = new Uint8Array(nv), mix = new Float32Array(nv), blush = new Float32Array(nv);
  const skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4);
  const parent = BONES.map(b => b[1]);
  const boneD = new Float32Array(BONES.length);
  for (let q = 0; q < nv; q++) {
    const x = m.positions[q * 3], y = m.positions[q * 3 + 1], z = m.positions[q * 3 + 2];
    boneD.fill(1e9);
    const regD = new Float32Array(8).fill(1e9);
    for (const p of adds) {
      const d = p.f(x, y, z);
      if (d < regD[p.region]) regD[p.region] = d;
      if (d < boneD[p.bone]) boneD[p.bone] = d;
    }
    let r1 = 0, r2 = -1;
    for (let r = 1; r < 8; r++) if (regD[r] < regD[r1]) r1 = r;
    for (let r = 0; r < 8; r++) if (r !== r1 && (r2 < 0 || regD[r] < regD[r2])) r2 = r;
    region[q] = r1; region2[q] = r2;
    mix[q] = 0.5 * Math.exp(-(regD[r2] - regD[r1]) / 0.008);
    // os le plus proche + ses voisins directs dans la hiérarchie (évite qu'une cuisse tire l'autre)
    let b0 = 0;
    for (let b = 1; b < BONES.length; b++) if (boneD[b] < boneD[b0]) b0 = b;
    const cand = [];
    for (let b = 0; b < BONES.length; b++) {
      if (b === b0 || parent[b] === b0 || parent[b0] === b) cand.push([b, Math.exp(-(boneD[b] - boneD[b0]) / 0.022)]);
    }
    cand.sort((a, b) => b[1] - a[1]);
    const top = cand.slice(0, 4);
    const sum = top.reduce((s, c) => s + c[1], 0);
    top.forEach(([b, w], k) => { skinIndex[q * 4 + k] = b; skinWeight[q * 4 + k] = w / sum; });
    for (const f of BLUSH) blush[q] = Math.max(blush[q], Math.min(1, Math.max(0, -f(x, y, z) / 0.02)));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(m.index), 1));
  BODY = { geo, region, region2, mix, blush, ao: m.ao };
  return BODY;
}

// =====================================================================
// Cheveux (maillage d'un seul tenant, rigide, attaché à la tête)
// Coordonnées relatives au centre de la tête.
// =====================================================================
const hairCache = new Map();
function hairSdf(style) {
  const cap = ellipsoid([0, 0.0, -0.005], [0.205, 0.225, 0.215]);
  // ligne des cheveux : plus haute sur le front, descend vers la nuque
  const hairline = (y, z) => (z > 0 ? 0.075 + z * 0.35 : 0.06 + z * 0.75) - y;
  const base = (x, y, z) => Math.max(cap(x, y, z), hairline(y, z));
  const parts = [];
  const cone = (a, b, r1, r2, k = 0.035) => parts.push([roundCone(a, b, r1, r2), k]);
  const ell = (c, r, k = 0.04) => parts.push([ellipsoid(c, r), k]);
  if (style === 'spiky') {
    // grande mèche relevée et pointue, balayée vers l'arrière (comme le modèle)
    cone([0.0, 0.16, 0.1], [0.02, 0.31, 0.19], 0.06, 0.008);
    cone([0.0, 0.18, 0.03], [0.0, 0.38, 0.03], 0.075, 0.008);
    cone([0.07, 0.17, 0.0], [0.14, 0.32, -0.04], 0.06, 0.008);
    cone([-0.07, 0.17, 0.0], [-0.14, 0.32, -0.04], 0.06, 0.008);
    cone([0.0, 0.16, -0.07], [0.0, 0.31, -0.2], 0.07, 0.008);
    cone([0.08, 0.13, -0.1], [0.16, 0.22, -0.24], 0.055, 0.008);
    cone([-0.08, 0.13, -0.1], [-0.16, 0.22, -0.24], 0.055, 0.008);
    cone([0.15, 0.1, 0.03], [0.24, 0.17, 0.0], 0.045, 0.006);
    cone([-0.15, 0.1, 0.03], [-0.24, 0.17, 0.0], 0.045, 0.006);
    cone([0.05, 0.12, 0.15], [0.1, 0.2, 0.22], 0.04, 0.006);
  } else if (style === 'ponytail') {
    ell([-0.05, 0.14, 0.13], [0.15, 0.07, 0.08]);
    cone([0, 0.12, -0.19], [0, -0.22, -0.3], 0.075, 0.03, 0.05);
    cone([0.17, 0.08, 0.06], [0.17, -0.14, 0.05], 0.045, 0.028);
    cone([-0.17, 0.08, 0.06], [-0.17, -0.14, 0.05], 0.045, 0.028);
  } else if (style === 'bun') {
    parts.push([sphere([0, 0.25, -0.09], 0.1), 0.04]);
    ell([0, 0.15, 0.12], [0.17, 0.06, 0.08]);
  } else if (style === 'short') {
    ell([0, 0.17, 0.03], [0.17, 0.07, 0.17]);
    cone([0.0, 0.17, 0.12], [0.0, 0.22, 0.17], 0.05, 0.02);
  }
  return (x, y, z) => {
    let d = base(x, y, z);
    for (const [f, k] of parts) d = smin(d, f(x, y, z), k);
    return d;
  };
}
function beardSdf() {
  const jaw = ellipsoid([0, -0.1, 0.04], [0.172, 0.15, 0.17]);
  const mous = roundCone([-0.055, -0.058, 0.188], [0.055, -0.058, 0.188], 0.017, 0.017);
  return (x, y, z) => {
    let d = Math.max(jaw(x, y, z), y + 0.04 - Math.max(0, -z) * 0.6, -z - 0.02);
    // dégager la bouche
    d = smax(d, -ellipsoid([0, -0.085, 0.19], [0.035, 0.014, 0.05])(x, y, z), 0.01);
    return smin(d, mous(x, y, z), 0.015);
  };
}
function hairGeometry(key, sdf) {
  if (hairCache.has(key)) return hairCache.get(key);
  const m = surfaceNets(sdf, [-0.3, -0.36, -0.4], [0.3, 0.42, 0.3], 0.0085);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(m.index), 1));
  const res = { geo, ao: m.ao };
  hairCache.set(key, res);
  return res;
}
function aoColored(geoData, hex) {
  const g = geoData.geo.clone();
  const c = new THREE.Color(hex);
  const n = geoData.ao.length, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = geoData.ao[i]; col[i * 3] = c.r * a; col[i * 3 + 1] = c.g * a; col[i * 3 + 2] = c.b * a; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Précalcule les maillages (corps + coiffures) pour éviter un blocage au lancement.
export function prewarm() {
  bodyData();
  for (const st of ['spiky', 'ponytail', 'bun', 'short']) hairGeometry(st, hairSdf(st));
  hairGeometry('beard', beardSdf());
}

// =====================================================================
// Poses (angles des articulations, bras « pendants » = 0)
// =====================================================================
const JOINTS = ['hipL', 'hipR', 'kneeL', 'kneeR', 'shLx', 'shRx', 'shLz', 'shRz',
  'elLx', 'elRx', 'elLz', 'elRz', 'torsoX', 'torsoZ', 'headX', 'headY', 'headZ'];
const base = Object.fromEntries(JOINTS.map(j => [j, 0]));
const SIT_LEGS = { hipL: -1.57, hipR: -1.57, kneeL: 1.5, kneeR: 1.5 };
export const POSES = {
  stand: { ...base, shLz: 0.17, shRz: -0.17, elLx: -0.12, elRx: -0.12 },
  sit: { ...base, ...SIT_LEGS, shLx: -0.7, shRx: -0.7, shLz: 0.12, shRz: -0.12, elLx: -1.4, elRx: -1.4, torsoX: 0.08 },
  aim: { ...base, ...SIT_LEGS, shLx: -0.7, shLz: 0.12, elLx: -1.25,
    shRx: -0.15, shRz: -1.6, elRz: -1.6, elRx: 0, torsoX: 0.04, headZ: 0.1 },
  dead: { ...base, ...SIT_LEGS, kneeL: 1.3, shLx: -1.5, shRx: -1.35, shLz: 0.35, shRz: -0.45, elLx: -0.25, elRx: -0.15,
    torsoX: 0.85, torsoZ: 0.12, headX: 0.35, headY: 0.5, headZ: 0.3 },
};
export function lerpPose(a, b, t) {
  const p = {};
  for (const j of JOINTS) p[j] = a[j] + (b[j] - a[j]) * t;
  return p;
}

// =====================================================================
// Construction d'un personnage
// =====================================================================
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts }));
  return matCache.get(key);
}
function part(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function buildCharacter(cfg) {
  const c = {
    skin: '#f0c4a2', hair: '#25252a', coat: '#8a8d92', scarf: '#7c7f84',
    pants: '#1e1e25', cuff: '#7c7f84', boots: '#171717', tail: null, hairStyle: 'spiky',
    width: 1, ...cfg,
  };
  const data = bodyData();
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.set(c.width, 1, c.width);
  root.add(body);

  // Squelette
  const bones = BONES.map(([name]) => { const b = new THREE.Bone(); b.name = name; return b; });
  BONES.forEach(([, parent, p], i) => {
    const pp = parent < 0 ? [0, 0, 0] : BONES[parent][2];
    bones[i].position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
    if (parent >= 0) bones[parent].add(bones[i]);
  });
  body.add(bones[0]);

  // Couleurs par sommet (vêtements, peau, joues) modulées par l'occlusion ambiante
  const palette = [c.skin, c.coat, c.pants, c.cuff, c.boots, c.scarf, c.tail || c.pants, '#c9776a'].map(h => new THREE.Color(h));
  const blushCol = new THREE.Color('#ee8f86');
  const nv = data.region.length, col = new Float32Array(nv * 3), tmp = new THREE.Color();
  for (let q = 0; q < nv; q++) {
    tmp.copy(palette[data.region[q]]).lerp(palette[data.region2[q]], data.mix[q]);
    if (data.blush[q] > 0 && data.region[q] === R.skin) tmp.lerp(blushCol, data.blush[q] * 0.55);
    const a = data.ao[q];
    col[q * 3] = tmp.r * a; col[q * 3 + 1] = tmp.g * a; col[q * 3 + 2] = tmp.b * a;
  }
  const geo = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) geo.setAttribute(name, data.geo.getAttribute(name));
  geo.setIndex(data.geo.getIndex());
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const skin = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }));
  skin.castShadow = true;
  skin.receiveShadow = true;
  skin.frustumCulled = false;
  body.add(skin);
  body.updateMatrixWorld(true);
  skin.bind(new THREE.Skeleton(bones));

  const bone = name => bones[B[name]];
  const head = bone('head');
  const headCenter = new THREE.Object3D();
  headCenter.position.set(0, HEAD_C[1] - BONES[B.head][2][1], 0);
  head.add(headCenter);

  // Visage : yeux, sourcils, bouche
  const white = mat('#fbfaf6', { roughness: 0.25 });
  const iris = mat(c.eyes || '#4a2e1c', { roughness: 0.3 });
  const pupil = mat('#0b0b0d', { roughness: 0.2 });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const browMat = mat(c.hair, { roughness: 0.8 });
  for (const s of [1, -1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.068, 0.015, 0.156);
    eye.add(part(new THREE.SphereGeometry(0.03, 20, 16), white));
    eye.add(part(new THREE.SphereGeometry(0.0155, 16, 12), iris, 0, 0, 0.0185));
    eye.add(part(new THREE.SphereGeometry(0.0085, 12, 10), pupil, 0, 0, 0.0245));
    eye.add(part(new THREE.SphereGeometry(0.0035, 8, 6), shine, -0.006, 0.006, 0.0295));
    // paupière supérieure (couleur peau) pour un regard détendu
    const lid = part(new THREE.SphereGeometry(0.0325, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.36), mat(c.skin, { roughness: 0.6 }));
    lid.rotation.x = 0.55;
    eye.add(lid);
    headCenter.add(eye);
    const brow = part(new THREE.CapsuleGeometry(0.008, 0.045, 4, 8), browMat, s * 0.07, 0.068, 0.178);
    brow.rotation.set(-0.25, 0, Math.PI / 2 - s * 0.1);
    headCenter.add(brow);
  }
  const smile = part(new THREE.TorusGeometry(0.026, 0.0045, 8, 20, Math.PI * 0.8), mat('#7a3b33', { roughness: 0.5 }), 0, -0.076, 0.199);
  smile.rotation.set(-0.15, 0, Math.PI + Math.PI * 0.1);
  headCenter.add(smile);
  if (c.glasses) {
    const frame = mat('#151518', { roughness: 0.3, metalness: 0.4 });
    for (const s of [1, -1]) headCenter.add(part(new THREE.TorusGeometry(0.038, 0.005, 8, 24), frame, s * 0.068, 0.015, 0.195));
    headCenter.add(part(new THREE.BoxGeometry(0.06, 0.006, 0.006), frame, 0, 0.02, 0.2));
  }

  // Cheveux et barbe : maillages d'un seul tenant
  const hairMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  const hairMesh = new THREE.Mesh(aoColored(hairGeometry(c.hairStyle, hairSdf(c.hairStyle)), c.hair), hairMat);
  hairMesh.castShadow = true;
  headCenter.add(hairMesh);
  if (c.hairStyle === 'ponytail') headCenter.add(part(new THREE.SphereGeometry(0.03, 12, 10), mat('#d8b04a'), 0, 0.11, -0.215));
  if (c.beard) {
    const beard = new THREE.Mesh(aoColored(hairGeometry('beard', beardSdf()), c.hair), hairMat);
    beard.castShadow = true;
    headCenter.add(beard);
  }

  // Détails rigides du manteau : boutons et bretelles
  const chest = bone('chest');
  const btn = mat('#4e5056', { roughness: 0.4 });
  for (const y of [-0.06, 0.02]) chest.add(part(new THREE.SphereGeometry(0.012, 10, 8), btn, 0, y, 0.138));
  for (const y of [-0.18, -0.12]) bone('spine').add(part(new THREE.SphereGeometry(0.012, 10, 8), btn, 0, y + 0.18, 0.125));

  // Point d'accroche de la main droite (pour le revolver)
  const handR = new THREE.Object3D();
  const wr = wristOf(-1), elR = elbowOf(-1), hand = along(wr, -1, 0.07);
  handR.position.set(hand[0] - elR[0], hand[1] - elR[1], hand[2] - elR[2] + 0.02);
  bone('elR').add(handR);

  const ch = {
    root, body, bones, head, headCenter, handR,
    torso: bone('spine'), hips: bone('hips'),
    pose: { ...POSES.stand }, walkPhase: 0, walking: false,
    applyPose(p) {
      this.pose = p;
      bone('hipL').rotation.x = p.hipL; bone('hipR').rotation.x = p.hipR;
      bone('knL').rotation.x = p.kneeL; bone('knR').rotation.x = p.kneeR;
      // les bras sont modélisés écartés (pose en « A ») : on compense l'ouverture
      bone('shL').rotation.set(p.shLx, 0, p.shLz - ARM_A);
      bone('shR').rotation.set(p.shRx, 0, p.shRz + ARM_A);
      bone('elL').rotation.set(p.elLx, 0, p.elLz);
      bone('elR').rotation.set(p.elRx, 0, p.elRz);
      this.torso.rotation.set(p.torsoX * 0.5, 0, p.torsoZ * 0.5);
      bone('chest').rotation.set(p.torsoX * 0.5, 0, p.torsoZ * 0.5);
      head.rotation.set(p.headX, p.headY, p.headZ);
    },
    updateWalk(dt) {
      if (!this.walking) return;
      this.walkPhase += dt * 8;
      const s = Math.sin(this.walkPhase);
      const p = { ...POSES.stand };
      p.hipL = s * 0.5; p.hipR = -s * 0.5;
      p.kneeL = Math.max(0, -s) * 0.75 + 0.05; p.kneeR = Math.max(0, s) * 0.75 + 0.05;
      p.shLx = -s * 0.4; p.shRx = s * 0.4;
      p.elLx = -0.25 - Math.max(0, s) * 0.2; p.elRx = -0.25 - Math.max(0, -s) * 0.2;
      p.torsoX = 0.05;
      p.headZ = s * 0.03;
      this.applyPose(p);
      this.body.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.03;
    },
    idle(time, seed) {
      if (this.walking || this.dead || this.busy) return;
      this.torso.position.y = BONES[B.spine][2][1] - HIP_Y + Math.sin(time * 1.6 + seed) * 0.004;
      head.rotation.y = this.pose.headY + Math.sin(time * 0.5 + seed * 3) * 0.12;
    },
  };
  ch.applyPose(POSES.stand);
  return ch;
}

// ---------- Revolver ----------
export function buildRevolver() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#3a3b40', metalness: 0.85, roughness: 0.35 });
  const wood = new THREE.MeshStandardMaterial({ color: '#5a3520', roughness: 0.6 });
  const barrel = part(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 10), metal, 0, 0.03, 0.12);
  barrel.rotation.x = Math.PI / 2;
  g.add(barrel);
  const drum = part(new THREE.CylinderGeometry(0.038, 0.038, 0.06, 12), metal, 0, 0.025, 0.0);
  drum.rotation.x = Math.PI / 2;
  g.add(drum);
  g.add(part(new THREE.BoxGeometry(0.035, 0.04, 0.08), metal, 0, 0.03, -0.04));
  const grip = part(new THREE.BoxGeometry(0.035, 0.11, 0.05), wood, 0, -0.03, -0.08);
  grip.rotation.x = 0.35;
  g.add(grip);
  g.userData.drum = drum;
  return g;
}
