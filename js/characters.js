// Personnages 3D « chibi » construits avec des primitives Three.js.
// Repère local : pieds à y = 0, le personnage regarde vers +z.
import * as THREE from 'three';

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts }));
  }
  return matCache.get(key);
}

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const HIP_Y = 0.52;

// ---------- Poses (angles des articulations) ----------
const JOINTS = ['hipL', 'hipR', 'kneeL', 'kneeR', 'shLx', 'shRx', 'shLz', 'shRz',
  'elLx', 'elRx', 'elLz', 'elRz', 'torsoX', 'torsoZ', 'headX', 'headY', 'headZ'];

const base = Object.fromEntries(JOINTS.map(j => [j, 0]));
export const POSES = {
  stand: { ...base, shLz: 0.12, shRz: -0.12 },
  sit: { ...base, hipL: -1.57, hipR: -1.57, kneeL: 1.45, kneeR: 1.45,
    shLx: -0.75, shRx: -0.75, shLz: 0.1, shRz: -0.1, elLx: -0.9, elRx: -0.9, torsoX: 0.12 },
  aim: { ...base, hipL: -1.57, hipR: -1.57, kneeL: 1.45, kneeR: 1.45,
    shLx: -0.75, shLz: 0.1, elLx: -0.9, shRx: -0.2, shRz: -2.45, elRz: -0.55, torsoX: 0.05, headZ: 0.12 },
  dead: { ...base, hipL: -1.57, hipR: -1.57, kneeL: 1.3, kneeR: 1.4,
    shLx: -1.55, shRx: -1.4, shLz: 0.35, shRz: -0.5, elLx: -0.2, elRx: -0.1,
    torsoX: 0.95, torsoZ: 0.15, headX: 0.35, headY: 0.5, headZ: 0.3 },
};

export function lerpPose(a, b, t) {
  const p = {};
  for (const j of JOINTS) p[j] = a[j] + (b[j] - a[j]) * t;
  return p;
}

// ---------- Construction ----------
export function buildCharacter(cfg) {
  const c = {
    skin: '#f2c9a8', hair: '#2a2a2e', coat: '#8a8d92', scarf: '#7f8287',
    pants: '#1d1d24', cuff: '#7f8287', boots: '#161616', hairStyle: 'spiky',
    width: 1, ...cfg,
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.set(c.width, 1, c.width);
  root.add(body);

  const M = {
    skin: mat(c.skin, { roughness: 0.6 }),
    hair: mat(c.hair, { roughness: 0.7 }),
    coat: mat(c.coat),
    scarf: mat(c.scarf, { roughness: 0.95 }),
    pants: mat(c.pants),
    cuff: mat(c.cuff, { roughness: 0.95 }),
    boots: mat(c.boots, { roughness: 0.5 }),
    dark: mat('#151518', { roughness: 0.4 }),
    white: mat('#ffffff', { roughness: 0.2 }),
    blush: mat('#f29a96', { roughness: 0.9 }),
    button: mat('#55575c', { roughness: 0.5 }),
  };

  // Jambes
  const legs = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const hip = new THREE.Group();
    hip.position.set(0.1 * sx, HIP_Y, 0);
    hip.add(mesh(new THREE.CapsuleGeometry(0.085, 0.16, 4, 10), M.pants, 0, -0.12, 0));
    const knee = new THREE.Group();
    knee.position.y = -0.26;
    knee.add(mesh(new THREE.CapsuleGeometry(0.078, 0.1, 4, 10), M.pants, 0, -0.06, 0));
    knee.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 14), M.cuff, 0, -0.13, 0));
    const boot = mesh(new THREE.BoxGeometry(0.16, 0.1, 0.25), M.boots, 0, -0.21, 0.04);
    knee.add(boot);
    knee.add(mesh(new THREE.SphereGeometry(0.08, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.boots, 0, -0.16, 0.13));
    hip.add(knee);
    body.add(hip);
    legs['hip' + side] = hip;
    legs['knee' + side] = knee;
  }

  // Torse
  const torso = new THREE.Group();
  torso.position.y = HIP_Y;
  body.add(torso);
  const coat = mesh(new THREE.CapsuleGeometry(0.2, 0.22, 6, 16), M.coat, 0, 0.24, 0);
  coat.scale.set(1, 1, 0.82);
  torso.add(coat);
  const tail = mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.34, 18, 1, true, Math.PI * 0.6, Math.PI * 0.8), M.pants, 0, -0.05, -0.01);
  tail.material = mat(c.pants, { side: THREE.DoubleSide });
  torso.add(tail);
  for (const y of [0.12, 0.23, 0.34]) torso.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), M.button, 0, y, 0.165));
  for (const sx of [-1, 1]) {
    const strap = mesh(new THREE.BoxGeometry(0.03, 0.2, 0.02), M.dark, 0.1 * sx, 0.28, 0.155);
    strap.rotation.x = -0.15;
    torso.add(strap);
  }
  const scarf = mesh(new THREE.TorusGeometry(0.13, 0.075, 10, 20), M.scarf, 0, 0.46, 0);
  scarf.rotation.x = Math.PI / 2;
  torso.add(scarf);
  torso.add(mesh(new THREE.SphereGeometry(0.1, 12, 10), M.scarf, 0, 0.42, 0.11));

  // Bras
  const arms = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const sh = new THREE.Group();
    sh.position.set(0.24 * sx, 0.4, 0);
    sh.add(mesh(new THREE.CapsuleGeometry(0.072, 0.12, 4, 10), M.coat, 0, -0.09, 0));
    const el = new THREE.Group();
    el.position.y = -0.19;
    el.add(mesh(new THREE.CapsuleGeometry(0.066, 0.08, 4, 10), M.coat, 0, -0.05, 0));
    el.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12), M.cuff, 0, -0.11, 0));
    el.add(mesh(new THREE.SphereGeometry(0.058, 12, 10), M.skin, 0, -0.16, 0));
    const hand = new THREE.Group();
    hand.position.y = -0.17;
    el.add(hand);
    sh.add(el);
    torso.add(sh);
    arms['sh' + side] = sh;
    arms['el' + side] = el;
    arms['hand' + side] = hand;
  }

  // Tête
  const head = new THREE.Group();
  head.position.y = 0.55;
  torso.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.27, 28, 22), M.skin, 0, 0.25, 0);
  skull.scale.set(1.02, 0.95, 0.95);
  head.add(skull);
  for (const sx of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.06, 12, 10), M.skin, 0.265 * sx, 0.22, 0));
    head.add(mesh(new THREE.SphereGeometry(0.042, 14, 12), M.dark, 0.095 * sx, 0.24, 0.228));
    head.add(mesh(new THREE.SphereGeometry(0.013, 8, 6), M.white, 0.083 * sx, 0.255, 0.265));
    const brow = mesh(new THREE.BoxGeometry(0.085, 0.022, 0.02), M.hair, 0.1 * sx, 0.325, 0.235);
    brow.rotation.z = -0.15 * sx;
    head.add(brow);
    const blush = mesh(new THREE.SphereGeometry(0.045, 12, 8), M.blush, 0.16 * sx, 0.17, 0.2);
    blush.scale.set(1, 0.6, 0.3);
    head.add(blush);
  }
  head.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), M.skin, 0, 0.19, 0.265));
  const mouth = mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12, Math.PI), mat('#8a4a3c'), 0, 0.135, 0.245);
  mouth.rotation.z = Math.PI;
  head.add(mouth);
  if (c.glasses) {
    for (const sx of [-1, 1]) {
      const g = mesh(new THREE.TorusGeometry(0.06, 0.009, 6, 18), M.dark, 0.095 * sx, 0.24, 0.255);
      head.add(g);
    }
    head.add(mesh(new THREE.BoxGeometry(0.06, 0.01, 0.01), M.dark, 0, 0.245, 0.262));
  }
  buildHair(head, c, M);

  root.userData = { body, torso, head, ...legs, ...arms, cfg: c };
  const ch = {
    root, ...legs, ...arms, torso, head, body,
    pose: { ...POSES.stand },
    walkPhase: 0, walking: false,
    applyPose(p) {
      this.pose = p;
      this.hipL.rotation.x = p.hipL; this.hipR.rotation.x = p.hipR;
      this.kneeL.rotation.x = p.kneeL; this.kneeR.rotation.x = p.kneeR;
      this.shL.rotation.set(p.shLx, 0, p.shLz); this.shR.rotation.set(p.shRx, 0, p.shRz);
      this.elL.rotation.set(p.elLx, 0, p.elLz); this.elR.rotation.set(p.elRx, 0, p.elRz);
      this.torso.rotation.set(p.torsoX, 0, p.torsoZ);
      this.head.rotation.set(p.headX, p.headY, p.headZ);
    },
    // Cycle de marche procédural
    updateWalk(dt) {
      if (!this.walking) return;
      this.walkPhase += dt * 9;
      const s = Math.sin(this.walkPhase);
      const p = { ...POSES.stand };
      p.hipL = s * 0.55; p.hipR = -s * 0.55;
      p.kneeL = Math.max(0, -s) * 0.8; p.kneeR = Math.max(0, s) * 0.8;
      p.shLx = -s * 0.45; p.shRx = s * 0.45;
      p.elLx = -0.25; p.elRx = -0.25;
      p.torsoX = 0.06;
      p.headZ = s * 0.04;
      this.applyPose(p);
      this.body.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.035;
    },
    // Respiration / petits mouvements au repos
    idle(time, seed) {
      if (this.walking || this.dead || this.busy) return;
      this.torso.position.y = HIP_Y + Math.sin(time * 1.6 + seed) * 0.006;
      this.head.rotation.y = this.pose.headY + Math.sin(time * 0.5 + seed * 3) * 0.12;
    },
  };
  ch.applyPose(POSES.stand);
  return ch;
}

function buildHair(head, c, M) {
  // calotte qui épouse le crâne (dessus) + arrière de la tête jusqu'à la nuque
  const cap = mesh(new THREE.SphereGeometry(0.283, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.4), M.hair, 0, 0.25, 0);
  cap.scale.set(1.02, 0.95, 0.95);
  head.add(cap);
  const back = mesh(new THREE.SphereGeometry(0.283, 24, 16, Math.PI, Math.PI, 0, Math.PI * 0.68), M.hair, 0, 0.25, -0.004);
  back.scale.set(1.02, 0.95, 0.95);
  head.add(back);

  if (c.hairStyle === 'spiky') {
    // grande mèche relevée vers l'arrière, comme sur le modèle
    // grande mèche relevée vers l'arrière, comme sur le modèle
    const spikes = [
      // x, y, z, rotX, rotZ, rayon, hauteur
      [0.02, 0.56, 0.12, 0.25, -0.1, 0.13, 0.34],
      [0.0, 0.6, 0.0, -0.45, 0.05, 0.14, 0.4],
      [0.1, 0.56, -0.05, -0.7, -0.45, 0.12, 0.34],
      [-0.1, 0.56, -0.05, -0.7, 0.45, 0.12, 0.34],
      [0.0, 0.52, -0.16, -1.25, 0, 0.13, 0.34],
      [0.15, 0.48, -0.15, -1.3, -0.6, 0.1, 0.26],
      [-0.15, 0.48, -0.15, -1.3, 0.6, 0.1, 0.26],
      [0.21, 0.42, 0.04, -0.4, -1.05, 0.08, 0.22],
      [-0.21, 0.42, 0.04, -0.4, 1.05, 0.08, 0.22],
    ];
    for (const [x, y, z, rx, rz, r, h] of spikes) {
      const s = mesh(new THREE.ConeGeometry(r, h, 7), M.hair, x, y, z);
      s.rotation.set(rx, 0, rz);
      head.add(s);
    }
  } else if (c.hairStyle === 'ponytail') {
    const fringe = mesh(new THREE.SphereGeometry(0.15, 14, 10), M.hair, -0.06, 0.39, 0.15);
    fringe.scale.set(1.4, 0.5, 0.65);
    fringe.rotation.z = 0.25;
    head.add(fringe);
    const tie = mesh(new THREE.SphereGeometry(0.05, 10, 8), mat('#d8b04a'), 0, 0.42, -0.26);
    head.add(tie);
    const tail = mesh(new THREE.ConeGeometry(0.1, 0.42, 10), M.hair, 0, 0.24, -0.34);
    tail.rotation.x = Math.PI - 0.35;
    head.add(tail);
    for (const sx of [-1, 1]) {
      const side = mesh(new THREE.CapsuleGeometry(0.06, 0.16, 4, 8), M.hair, 0.24 * sx, 0.2, 0.06);
      head.add(side);
    }
  } else if (c.hairStyle === 'bun') {
    const bun = mesh(new THREE.SphereGeometry(0.13, 16, 12), M.hair, 0, 0.56, -0.1);
    head.add(bun);
    const fringe = mesh(new THREE.SphereGeometry(0.15, 14, 10), M.hair, 0, 0.395, 0.15);
    fringe.scale.set(1.5, 0.42, 0.62);
    head.add(fringe);
  } else if (c.hairStyle === 'short') {
    for (const [x, z] of [[0, 0.12], [0.1, 0.08], [-0.1, 0.08], [0.05, 0.0], [-0.05, 0.0]]) {
      const tuft = mesh(new THREE.SphereGeometry(0.07, 10, 8), M.hair, x, 0.5, z);
      tuft.scale.set(1, 0.6, 1);
      head.add(tuft);
    }
  }
  if (c.beard) {
    const beard = mesh(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), M.hair, 0, 0.2, 0.06);
    beard.scale.set(1.15, 1, 1);
    head.add(beard);
    const mous = mesh(new THREE.CapsuleGeometry(0.025, 0.1, 4, 8), M.hair, 0, 0.16, 0.255);
    mous.rotation.z = Math.PI / 2;
    head.add(mous);
  }
}

// ---------- Revolver ----------
export function buildRevolver() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#3a3b40', metalness: 0.85, roughness: 0.35 });
  const wood = new THREE.MeshStandardMaterial({ color: '#5a3520', roughness: 0.6 });
  const barrel = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 10), metal, 0, 0.03, 0.12);
  barrel.rotation.x = Math.PI / 2;
  g.add(barrel);
  const drum = mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.06, 12), metal, 0, 0.025, 0.0);
  drum.rotation.x = Math.PI / 2;
  g.add(drum);
  g.add(mesh(new THREE.BoxGeometry(0.035, 0.04, 0.08), metal, 0, 0.03, -0.04));
  const grip = mesh(new THREE.BoxGeometry(0.035, 0.11, 0.05), wood, 0, -0.03, -0.08);
  grip.rotation.x = 0.35;
  g.add(grip);
  g.userData.drum = drum;
  return g;
}
