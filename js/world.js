// Scène 3D : bar, table, personnages, cartes, caméra et animations.
import * as THREE from 'three';
import { buildCharacter, buildRevolver, POSES, lerpPose, HIP_Y } from './characters.js';
import { SUITS, label } from './rules.js';

const TABLE_Y = 0.8;
const SEAT_R = 1.32;
const SEAT_Y = 0.46;
const DOOR = new THREE.Vector3(-5.6, 0, 0.6);

let renderer, scene, camera, clock;
let container, labelsEl;
const camPos = new THREE.Vector3(3.4, 2.6, 5.4);
const camTarget = new THREE.Vector3(-1, 0.9, 0);
const tasks = new Set();
let seats = [];          // { angle, pos, chair }
let actors = [];         // { ch, label, seat, gun, cards: [] }
let flashLight, pendant;
let idleOrbit = true;

// ---------- Boucle & tweens ----------
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function tween(dur, fn, easing = ease) {
  return new Promise(res => tasks.add({ t: 0, dur, fn, easing, res }));
}
export const wait = s => tween(s, () => {});

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.1);
  const time = clock.elapsedTime;
  for (const k of [...tasks]) {
    k.t += dt;
    const x = Math.min(1, k.t / k.dur);
    try { k.fn(k.easing(x), dt); } catch (e) { console.error(e); tasks.delete(k); k.res(); continue; }
    if (x >= 1) { tasks.delete(k); k.res(); }
  }
  if (roam.active) updateRoam(dt);
  else if (idleOrbit) {
    const a = time * 0.06;
    camPos.set(Math.cos(a) * 5.2, 2.7, Math.sin(a) * 5.2);
    camTarget.set(0, 0.9, 0);
  }
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  actors.forEach((a, i) => { a.ch.updateWalk(dt); a.ch.idle(time, i * 1.7); });
  pendant.intensity = 9 + Math.sin(time * 7) * 0.15 + Math.sin(time * 13) * 0.1;
  renderer.render(scene, camera);
  updateLabels();
}

// ---------- Textures procédurales ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function woodTex(base, plank = 64) {
  return canvasTex(512, 512, (g, w, h) => {
    for (let y = 0; y < h; y += plank) {
      const l = 0.85 + Math.random() * 0.3;
      g.fillStyle = shade(base, l);
      g.fillRect(0, y, w, plank);
      g.strokeStyle = 'rgba(0,0,0,.35)';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      const cut = Math.random() * w;
      g.beginPath(); g.moveTo(cut, y); g.lineTo(cut, y + plank); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.08)';
      g.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const yy = y + Math.random() * plank;
        g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(w / 3, yy + 4, (2 * w) / 3, yy - 4, w, yy); g.stroke();
      }
    }
  });
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * f), gg = Math.min(255, ((n >> 8) & 255) * f), b = Math.min(255, (n & 255) * f);
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

const cardTexCache = new Map();
function cardFaceTex(card) {
  const key = card.r * 4 + card.s;
  if (cardTexCache.has(key)) return cardTexCache.get(key);
  const red = card.s === 1 || card.s === 2;
  const t = canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = '#f7f1e3';
    roundRect(g, 0, 0, w, h, 24); g.fill();
    g.fillStyle = red ? '#c0261c' : '#141414';
    g.font = 'bold 64px Arial';
    g.textAlign = 'left';
    g.fillText(label(card.r), 18, 70);
    g.font = '52px Arial';
    g.fillText(SUITS[card.s], 20, 128);
    g.font = 'bold 150px Arial';
    g.textAlign = 'center';
    g.fillText(SUITS[card.s], w / 2, h / 2 + 70);
  });
  cardTexCache.set(key, t);
  return t;
}
let backTex;
function cardBackTex() {
  if (!backTex) backTex = canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = '#f7f1e3'; roundRect(g, 0, 0, w, h, 24); g.fill();
    g.fillStyle = '#7a1f1a'; roundRect(g, 14, 14, w - 28, h - 28, 16); g.fill();
    g.strokeStyle = 'rgba(255,220,160,.35)'; g.lineWidth = 4;
    for (let i = -h; i < w + h; i += 22) { g.beginPath(); g.moveTo(i, 14); g.lineTo(i + h, h); g.stroke(); }
    g.fillStyle = '#e3b55b'; g.font = 'bold 44px Georgia'; g.textAlign = 'center';
    g.fillText('TapIn', w / 2, h / 2 + 14);
  });
  return backTex;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ---------- Construction du bar ----------
function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }); }
function box(w, h, d, material, x, y, z, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  scene.add(m);
  return m;
}

function buildRoom() {
  const floorTex = woodTex('#6b4429', 48);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(4, 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), std('#ffffff', { map: floorTex, roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a2a22'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { g.fillStyle = x % 64 ? '#52302a' : '#46271f'; g.fillRect(x, 0, 32, h); }
  });
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  wallTex.repeat.set(6, 2);
  const wallMat = std('#ffffff', { map: wallTex });
  const panel = std('#2e1a12');
  // murs (fond, gauche avec porte, droite, avant)
  box(12, 4, 0.2, wallMat, 0, 2, -6);
  box(0.2, 4, 5.0, wallMat, -6, 2, -3.5);
  box(0.2, 4, 4.4, wallMat, -6, 2, 3.8);
  box(0.2, 1.4, 1.6, wallMat, -6, 3.3, DOOR.z);
  box(0.2, 4, 12, wallMat, 6, 2, 0);
  box(12, 4, 0.2, wallMat, 0, 2, 6, false);
  // lambris bas
  box(11.9, 1, 0.05, panel, 0, 0.5, -5.88);
  box(0.05, 1, 11.9, panel, 5.88, 0.5, 0);

  // porte d'entrée (nuit bleue dehors)
  const night = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.6), new THREE.MeshBasicMaterial({ color: '#1b2b4a' }));
  night.position.set(-6.08, 1.3, DOOR.z);
  night.rotation.y = Math.PI / 2;
  scene.add(night);
  const frame = std('#2a170e');
  box(0.3, 2.7, 0.12, frame, -5.95, 1.35, DOOR.z - 0.85);
  box(0.3, 2.7, 0.12, frame, -5.95, 1.35, DOOR.z + 0.85);
  box(0.3, 0.12, 1.8, frame, -5.95, 2.66, DOOR.z);
  const doorLight = new THREE.PointLight('#5f86d8', 4, 5, 2);
  doorLight.position.set(-5.4, 2.2, DOOR.z);
  scene.add(doorLight);

  // comptoir et étagères
  const barWood = std('#ffffff', { map: woodTex('#4a2c1a', 40), roughness: 0.55 });
  box(6.5, 1.05, 0.8, barWood, 0.5, 0.525, -4.6);
  box(6.7, 0.08, 0.95, std('#2a170e', { roughness: 0.35 }), 0.5, 1.09, -4.6);
  const shelfMat = std('#3a2214');
  for (const y of [1.7, 2.3, 2.9]) box(5.5, 0.06, 0.35, shelfMat, 0.5, y, -5.75);
  const glassCols = ['#2f7a3d', '#8a3a1c', '#c99a3b', '#3a5f8a', '#7a2a4a', '#d8d0b0'];
  const bottleGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.3, 10);
  const neckGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.12, 8);
  for (const y of [1.7, 2.3, 2.9]) {
    for (let x = -2; x <= 3; x += 0.28 + Math.random() * 0.12) {
      const col = glassCols[Math.floor(Math.random() * glassCols.length)];
      const m = std(col, { roughness: 0.15, metalness: 0.1, emissive: col, emissiveIntensity: 0.25, transparent: true, opacity: 0.85 });
      const b = new THREE.Mesh(bottleGeo, m);
      b.position.set(x, y + 0.18, -5.72);
      const n = new THREE.Mesh(neckGeo, m);
      n.position.set(x, y + 0.39, -5.72);
      scene.add(b, n);
    }
  }
  // tabourets devant le bar
  for (const x of [-1.5, 0, 1.5, 3]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), std('#7a2a22', { roughness: 0.5 }));
    st.position.set(x, 0.75, -3.8); st.castShadow = true;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.75, 8), std('#222', { metalness: 0.7, roughness: 0.4 }));
    leg.position.set(x, 0.375, -3.8); leg.castShadow = true;
    scene.add(st, leg);
  }

  // enseigne néon
  const neon = canvasTex(512, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = 'italic bold 110px Georgia'; g.textAlign = 'center';
    g.shadowColor = '#ff4fa0'; g.shadowBlur = 30;
    g.fillStyle = '#ffd1ea';
    g.fillText('TapIn', w / 2, 118);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), new THREE.MeshBasicMaterial({ map: neon, transparent: true }));
  sign.position.set(0.5, 3.45, -5.88);
  scene.add(sign);
  const pink = new THREE.PointLight('#ff4fa0', 6, 6, 2);
  pink.position.set(0.5, 3.2, -5.2);
  scene.add(pink);
  const barGlow = new THREE.PointLight('#ffb35c', 5, 6, 2);
  barGlow.position.set(0.5, 2.4, -4.6);
  scene.add(barGlow);

  // table ronde
  const felt = std('#1f5a3a', { roughness: 0.95 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.05, 48), felt);
  top.position.y = TABLE_Y; top.receiveShadow = true; top.castShadow = true;
  scene.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.055, 12, 48), std('#4a2a17', { roughness: 0.45 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = TABLE_Y + 0.01; rim.castShadow = true;
  scene.add(rim);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, TABLE_Y, 16), std('#2e1a10'));
  ped.position.y = TABLE_Y / 2; ped.castShadow = true;
  scene.add(ped);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.06, 24), std('#2e1a10'));
  foot.position.y = 0.03;
  scene.add(foot);

  // lampe suspendue
  const shade_ = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.3, 24, 1, true),
    std('#2d4a2f', { side: THREE.DoubleSide, roughness: 0.5 }));
  shade_.position.set(0, 2.55, 0);
  scene.add(shade_);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), new THREE.MeshBasicMaterial({ color: '#fff2c8' }));
  bulb.position.set(0, 2.42, 0);
  scene.add(bulb);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.4), std('#111'));
  cord.position.set(0, 3.4, 0);
  scene.add(cord);
  pendant = new THREE.SpotLight('#ffcf8a', 9, 7, 1.0, 0.55, 1.2);
  pendant.position.set(0, 2.4, 0);
  pendant.target.position.set(0, 0, 0);
  pendant.castShadow = true;
  pendant.shadow.mapSize.set(1024, 1024);
  pendant.shadow.bias = -0.0004;
  pendant.shadow.camera.near = 0.3;
  scene.add(pendant, pendant.target);

  scene.add(new THREE.HemisphereLight('#ffd9b0', '#2a1a10', 1.0));
  flashLight = new THREE.PointLight('#ffdd99', 0, 6, 2);
  scene.add(flashLight);
}

function buildChair(angle) {
  const g = new THREE.Group();
  const wood = std('#5a341d', { roughness: 0.6 });
  const add = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  };
  add(0.5, 0.05, 0.46, 0, SEAT_Y, 0);
  for (const [x, z] of [[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.19], [0.21, 0.19]]) add(0.045, SEAT_Y, 0.045, x, SEAT_Y / 2, z);
  add(0.05, 0.6, 0.05, -0.21, SEAT_Y + 0.3, -0.21);
  add(0.05, 0.6, 0.05, 0.21, SEAT_Y + 0.3, -0.21);
  add(0.47, 0.16, 0.04, 0, SEAT_Y + 0.5, -0.21);
  add(0.47, 0.06, 0.04, 0, SEAT_Y + 0.28, -0.21);
  const pos = new THREE.Vector3(Math.cos(angle) * SEAT_R, 0, Math.sin(angle) * SEAT_R);
  g.position.copy(pos);
  g.lookAt(0, 0, 0);
  scene.add(g);
  return { angle, pos, chair: g };
}

// ---------- Initialisation ----------
export function init(el, labels) {
  container = el;
  labelsEl = labels;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#120b08');
  scene.fog = new THREE.Fog('#120b08', 8, 16);
  camera = new THREE.PerspectiveCamera(50, 1, 0.05, 40);
  clock = new THREE.Clock();
  buildRoom();
  freeMarker = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.5, 40),
    new THREE.MeshBasicMaterial({ color: '#e3b55b', transparent: true, opacity: 0.5, depthWrite: false }));
  freeMarker.rotation.x = -Math.PI / 2;
  freeMarker.visible = false;
  scene.add(freeMarker);
  initInput();
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(loop);
}

function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // sur écran étroit, on élargit le champ pour garder la table entière
  camera.fov = w / h < 0.8 ? 68 : 50;
  camera.updateProjectionMatrix();
}

// Angles des sièges : le joueur humain (index 0) est face caméra (+z).
const SEAT_ANGLES = {
  2: [Math.PI / 2, -Math.PI / 2],
  3: [Math.PI / 2, Math.PI * 1.17, -Math.PI * 0.17],
  4: [Math.PI / 2, Math.PI, -Math.PI / 2, 0],
};

// ---------- Personnages ----------
export function setupPlayers(players) {
  for (const a of actors) {
    scene.remove(a.ch.root, a.gun);
    a.cards.forEach(c => scene.remove(c));
    a.label.remove();
  }
  for (const s of seats) scene.remove(s.chair);
  actors = [];
  roam.active = false;
  if (freeMarker) freeMarker.visible = false;
  seats = SEAT_ANGLES[players.length].map(buildChair);
  players.forEach((p, i) => {
    const ch = buildCharacter(p.look);
    ch.root.position.copy(DOOR);
    ch.root.visible = false;
    scene.add(ch.root);
    const gun = buildRevolver();
    gun.scale.setScalar(1.2);
    const seat = seats[i];
    const dir = seat.pos.clone().normalize();
    const tan = new THREE.Vector3(-dir.z, 0, dir.x);
    gun.position.copy(dir.clone().multiplyScalar(0.74)).add(tan.clone().multiplyScalar(0.3));
    gun.position.y = TABLE_Y + 0.045;
    gun.rotation.set(0, Math.atan2(-dir.x, -dir.z) + 0.6, Math.PI / 2);
    gun.userData.home = { pos: gun.position.clone(), rot: gun.rotation.clone() };
    scene.add(gun);
    const label = document.createElement('div');
    label.className = 'tag hidden';
    label.innerHTML = `<div class="tag-name">${p.name}</div><div class="tag-shots"></div>`;
    labelsEl.appendChild(label);
    actors.push({ ch, gun, label, seat, cards: [], player: p });
  });
}

function seatYaw(seat) {
  // le personnage regarde le centre de la table
  return Math.atan2(-seat.pos.x, -seat.pos.z);
}

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

async function walkPath(ch, pts, speed = 1.25) {
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = lens[lens.length - 1];
  ch.walking = true;
  let yaw = ch.root.rotation.y;
  await tween(total / speed, (t, dt) => {
    const d = t * total;
    let i = 1;
    while (i < lens.length - 1 && lens[i] < d) i++;
    const k = (d - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
    const p = pts[i - 1].clone().lerp(pts[i], k);
    const dx = pts[i].x - pts[i - 1].x, dz = pts[i].z - pts[i - 1].z;
    yaw = angleLerp(yaw, Math.atan2(dx, dz), Math.min(1, dt * 8));
    ch.root.rotation.y = yaw;
    ch.root.position.copy(p);
  }, t => t);
  ch.walking = false;
  ch.body.position.y = 0;
}

async function walkToSeat(a) {
  const { ch, seat } = a;
  ch.root.visible = true;
  ch.root.position.copy(DOOR);
  ch.root.rotation.y = Math.PI / 2;
  ch.applyPose(POSES.stand);
  // chemin : porte -> cercle autour de la table -> à côté de la chaise
  const R = 2.15;
  const start = Math.PI - 0.25;
  let end = seat.angle;
  while (end - start > Math.PI) end -= Math.PI * 2;
  while (start - end > Math.PI) end += Math.PI * 2;
  const pts = [DOOR.clone(), new THREE.Vector3(-3.6, 0, 0.5)];
  const steps = Math.max(2, Math.ceil(Math.abs(end - start) / 0.25));
  for (let i = 0; i <= steps; i++) {
    const ang = start + ((end - start) * i) / steps;
    pts.push(new THREE.Vector3(Math.cos(ang) * R, 0, Math.sin(ang) * R));
  }
  const dir = seat.pos.clone().normalize();
  const tan = new THREE.Vector3(-dir.z, 0, dir.x);
  const side = seat.pos.clone().add(tan.multiplyScalar(0.45 * Math.sign(end - start || 1)));
  pts.push(side);
  a.label.classList.remove('hidden');
  await walkPath(ch, pts);
  await sitOn(a);
}

// Animation « s'asseoir » depuis la position actuelle jusqu'au siège de l'acteur.
async function sitOn(a) {
  const { ch, seat } = a;
  ch.walking = false;
  ch.body.position.y = 0;
  const dir = seat.pos.clone().normalize();
  const from = ch.root.position.clone();
  const to = seat.pos.clone().add(dir.multiplyScalar(0.03));
  to.y = SEAT_Y + 0.085 - HIP_Y;
  const yaw0 = ch.root.rotation.y, yaw1 = seatYaw(seat);
  const pose0 = { ...ch.pose };
  await tween(0.75, t => {
    ch.root.position.lerpVectors(from, to, t);
    ch.root.rotation.y = angleLerp(yaw0, yaw1, Math.min(1, t * 1.5));
    ch.applyPose(lerpPose(pose0, POSES.sit, t));
  });
  a.seated = true;
}

// Les bots indiqués entrent l'un après l'autre et vont s'asseoir.
export function botsToSeats(indices, delay = 1.2) {
  return Promise.all(indices.map((i, k) => wait(0.8 + k * delay).then(() => walkToSeat(actors[i]))));
}

export function allSeated() { return actors.every(a => a.seated); }

// ---------- Exploration libre (personnage contrôlé par le joueur) ----------
const input = { keys: new Set(), joy: { x: 0, y: 0 }, dragging: false, lastX: 0 };
const roam = { active: false, i: 0, camYaw: Math.PI / 2, camDist: 3.4, near: false, onNear: null };
const PLAYER_R = 0.25;
let freeMarker;

export function spawnPlayer(i) {
  const a = actors[i];
  a.ch.root.visible = true;
  a.ch.root.position.set(DOOR.x + 1.4, 0, DOOR.z + 1.3);
  a.ch.root.rotation.y = Math.PI / 2;
  a.ch.applyPose(POSES.stand);
  a.label.classList.remove('hidden');
  roam.camYaw = Math.PI / 2;
}

export function startRoam(i, onNear) {
  roam.active = true;
  roam.i = i;
  roam.near = false;
  roam.onNear = onNear;
  idleOrbit = false;
  // repère lumineux sur la chaise libre
  const seat = actors[i].seat;
  freeMarker.position.set(seat.pos.x, 0.02, seat.pos.z);
  freeMarker.visible = true;
}

export function stopRoam() {
  roam.active = false;
  freeMarker.visible = false;
  const ch = actors[roam.i].ch;
  ch.walking = false;
}

export function isNearSeat() { return roam.active && roam.near; }

export async function sitPlayer() {
  const a = actors[roam.i];
  stopRoam();
  await sitOn(a);
}

// Obstacles pour les collisions (cercles et boîtes au sol)
function obstacles() {
  const circles = [{ x: 0, z: 0, r: 1.08 }];
  for (const s of seats) circles.push({ x: s.pos.x, z: s.pos.z, r: 0.3 });
  for (const a of actors) {
    if (a === actors[roam.i] || !a.ch.root.visible) continue;
    circles.push({ x: a.ch.root.position.x, z: a.ch.root.position.z, r: 0.22 });
  }
  for (const x of STOOLS_X) circles.push({ x, z: -3.8, r: 0.24 });
  return circles;
}
const STOOLS_X = [-1.5, 0, 1.5, 3];
const BOXES = [{ x0: -2.8, x1: 3.8, z0: -5.1, z1: -4.15 }]; // comptoir

function collide(p) {
  for (const c of obstacles()) {
    const dx = p.x - c.x, dz = p.z - c.z;
    const d = Math.hypot(dx, dz), min = c.r + PLAYER_R;
    if (d < min && d > 1e-4) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
  }
  for (const b of BOXES) {
    const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d < PLAYER_R) {
      if (d > 1e-4) { p.x = cx + (dx / d) * PLAYER_R; p.z = cz + (dz / d) * PLAYER_R; }
      else p.z = b.z1 + PLAYER_R;
    }
  }
  const lim = 5.65;
  p.x = Math.max(-lim, Math.min(lim, p.x));
  p.z = Math.max(-lim, Math.min(lim, p.z));
}

const camWanted = new THREE.Vector3(), lookWanted = new THREE.Vector3();
function updateRoam(dt) {
  const a = actors[roam.i];
  const ch = a.ch;
  // entrée clavier (codes physiques : ZQSD en AZERTY = WASD en QWERTY) + joystick
  const k = input.keys;
  let fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  let side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  fwd += -input.joy.y;
  side += input.joy.x;
  const len = Math.hypot(fwd, side);
  if (len > 1) { fwd /= len; side /= len; }
  const run = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(input.joy.x, input.joy.y) > 0.95;
  const speed = run ? 2.6 : 1.7;

  const f = new THREE.Vector3(Math.sin(roam.camYaw), 0, Math.cos(roam.camYaw));
  const r = new THREE.Vector3(-f.z, 0, f.x);
  const move = f.multiplyScalar(fwd).add(r.multiplyScalar(side));
  const moving = move.lengthSq() > 0.01;
  if (moving) {
    const p = ch.root.position;
    p.addScaledVector(move, speed * dt);
    collide(p);
    ch.root.rotation.y = angleLerp(ch.root.rotation.y, Math.atan2(move.x, move.z), Math.min(1, dt * 12));
    if (!ch.walking) ch.walking = true;
    ch.walkPhase += dt * (run ? 4 : 0);
  } else if (ch.walking) {
    ch.walking = false;
    ch.body.position.y = 0;
    ch.applyPose(POSES.stand);
  }

  // caméra à la troisième personne
  const p = ch.root.position;
  const back = new THREE.Vector3(Math.sin(roam.camYaw), 0, Math.cos(roam.camYaw));
  camWanted.copy(p).addScaledVector(back, -roam.camDist);
  camWanted.x = Math.max(-5.7, Math.min(5.7, camWanted.x));
  camWanted.z = Math.max(-5.7, Math.min(5.7, camWanted.z));
  // contre un mur, la caméra se rapproche : on la monte pour garder la vue dégagée
  const squeeze = roam.camDist - Math.hypot(camWanted.x - p.x, camWanted.z - p.z);
  camWanted.y = 2.2 + Math.max(0, squeeze) * 0.7;
  lookWanted.copy(p).addScaledVector(back, 1.2);
  lookWanted.y = 1.0;
  const s = Math.min(1, dt * 6);
  camPos.lerp(camWanted, s);
  camTarget.lerp(lookWanted, s);

  // proximité de la chaise libre
  const seat = a.seat.pos;
  const near = Math.hypot(p.x - seat.x, p.z - seat.z) < 0.95;
  if (near !== roam.near) { roam.near = near; roam.onNear && roam.onNear(near); }
  freeMarker.material.opacity = 0.45 + Math.sin(clock.elapsedTime * 4) * 0.2;
}

function initInput() {
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT') return;
    input.keys.add(e.code);
    if (roam.active && e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', e => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());
  // glisser pour tourner la caméra
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => {
    input.dragging = true; input.lastX = e.clientX;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
  });
  el.addEventListener('pointermove', e => {
    if (!input.dragging || !roam.active) return;
    roam.camYaw -= (e.clientX - input.lastX) * 0.006;
    input.lastX = e.clientX;
  });
  const end = () => { input.dragging = false; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', e => {
    if (!roam.active) return;
    roam.camDist = Math.max(2, Math.min(5, roam.camDist + e.deltaY * 0.003));
  }, { passive: true });
}

// Joystick tactile (mobile)
export function bindJoystick(base, knob) {
  let id = null, cx = 0, cy = 0;
  const R = 45;
  base.addEventListener('pointerdown', e => {
    id = e.pointerId;
    const b = base.getBoundingClientRect();
    cx = b.left + b.width / 2; cy = b.top + b.height / 2;
    try { base.setPointerCapture(id); } catch { /* pointeur déjà relâché */ }
    move(e);
  });
  const move = e => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.joy.x = dx / R; input.joy.y = dy / R;
  };
  const up = e => {
    if (e.pointerId !== id) return;
    id = null;
    knob.style.transform = '';
    input.joy.x = input.joy.y = 0;
  };
  base.addEventListener('pointermove', move);
  base.addEventListener('pointerup', up);
  base.addEventListener('pointercancel', up);
}

export async function intro() {
  idleOrbit = false;
  // plan large sur l'entrée
  await moveCamera(new THREE.Vector3(2.6, 2.4, 4.6), new THREE.Vector3(-2.2, 0.8, 0), 1.2);
  const walkers = actors.map((a, i) => wait(i * 1.1).then(() => walkToSeat(a)));
  // la caméra suit l'arrivée puis se place derrière le joueur
  await wait(1.2);
  moveCamera(new THREE.Vector3(3.2, 3.2, 3.6), new THREE.Vector3(0, 0.6, 0), 3.5);
  await Promise.all(walkers);
  await focusTable();
}

export function playerView() {
  const p0 = seats[0].pos;
  const back = p0.clone().normalize();
  const tan = new THREE.Vector3(-back.z, 0, back.x);
  const pos = p0.clone().add(back.multiplyScalar(1.1)).add(tan.multiplyScalar(-0.8));
  pos.y = 2.85;
  return { pos, target: new THREE.Vector3(0, TABLE_Y - 0.2, -0.45) };
}

export function focusTable(dur = 1.4) {
  const v = playerView();
  return moveCamera(v.pos, v.target, dur);
}

export function focusActor(i, dur = 1.1) {
  const a = actors[i];
  const p = a.seat.pos;
  const inward = p.clone().normalize().negate();
  const tan = new THREE.Vector3(-inward.z, 0, inward.x);
  const pos = p.clone().add(inward.multiplyScalar(2.7)).add(tan.multiplyScalar(0.6));
  pos.y = 1.95;
  const target = p.clone();
  target.y = 1.15;
  return moveCamera(pos, target, dur);
}

export function moveCamera(pos, target, dur) {
  const p0 = camPos.clone(), t0 = camTarget.clone();
  return tween(dur, t => {
    camPos.lerpVectors(p0, pos, t);
    camTarget.lerpVectors(t0, target, t);
  });
}

export function setIdleOrbit(v) { idleOrbit = v; }

// ---------- Cartes ----------
const CARD_W = 0.15, CARD_H = 0.21;
function makeCard(card) {
  const edge = std('#e8e0cc');
  const back = std('#ffffff', { map: cardBackTex(), roughness: 0.6 });
  const face = std('#ffffff', { map: cardFaceTex(card), roughness: 0.6 });
  // ordre des faces d'une BoxGeometry : +x, -x, +y, -y, +z, -z
  const m = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, 0.004, CARD_H), [edge, edge, back, face, edge, edge]);
  m.castShadow = true;
  m.receiveShadow = true;
  const holder = new THREE.Group();
  holder.add(m);
  holder.userData = { mesh: m, face };
  return holder;
}

export async function deal(hands, faceUpFor = 0) {
  clearCards();
  const jobs = [];
  actors.forEach((a, i) => {
    hands[i].forEach((card, k) => {
      const c = makeCard(card);
      const dir = a.seat.pos.clone().normalize();
      const tan = new THREE.Vector3(-dir.z, 0, dir.x);
      const target = dir.clone().multiplyScalar(0.62).add(tan.multiplyScalar((k - 1) * 0.17));
      target.y = TABLE_Y + 0.03 + k * 0.001;
      c.rotation.y = Math.atan2(dir.x, dir.z);
      c.position.set(0, TABLE_Y + 0.25, 0);
      scene.add(c);
      a.cards.push(c);
      const from = c.position.clone();
      const faceUp = i === faceUpFor;
      jobs.push(wait((k * actors.length + i) * 0.09).then(() => tween(0.45, t => {
        c.position.lerpVectors(from, target, t);
        c.position.y += Math.sin(t * Math.PI) * 0.15;
        c.userData.mesh.rotation.z = faceUp ? Math.PI * t : 0;
      })));
    });
  });
  await Promise.all(jobs);
}

export function clearCards() {
  for (const a of actors) { a.cards.forEach(c => scene.remove(c)); a.cards = []; }
}

export async function reveal(hands, isHighlighted) {
  const jobs = [];
  actors.forEach((a, i) => {
    a.cards.forEach((c, k) => {
      const card = hands[i][k];
      const hl = isHighlighted(card);
      const up = Math.abs(c.userData.mesh.rotation.z) > 1;
      jobs.push(wait(i * 0.15 + k * 0.05).then(() => tween(0.5, t => {
        if (!up) c.userData.mesh.rotation.z = Math.PI * t;
        c.position.y = TABLE_Y + 0.03 + Math.sin(t * Math.PI) * 0.12 + (hl ? t * 0.04 : 0);
        if (hl) {
          c.userData.face.emissive = new THREE.Color('#e3b55b');
          c.userData.face.emissiveIntensity = t * 0.35;
        }
      })));
    });
  });
  await Promise.all(jobs);
}

// ---------- Roulette ----------
export async function raiseGun(i) {
  const a = actors[i];
  a.ch.busy = true;
  await tween(0.5, t => a.ch.applyPose(lerpPose(POSES.sit, POSES.aim, t * 0.4)));
  a.ch.handR.attach(a.gun);
  const p0 = a.gun.position.clone(), q0 = a.gun.quaternion.clone();
  const headPos = new THREE.Vector3(), handPos = new THREE.Vector3(), aimPos = new THREE.Vector3();
  const q1 = new THREE.Quaternion();
  await tween(0.7, t => {
    a.ch.applyPose(lerpPose(POSES.sit, POSES.aim, 0.4 + t * 0.6));
    // canon posé contre la tempe : le revolver se place à l'extérieur de la main
    a.ch.root.updateWorldMatrix(true, true);
    a.ch.headCenter.getWorldPosition(headPos);
    a.ch.handR.getWorldPosition(handPos);
    aimPos.copy(handPos);
    a.ch.handR.worldToLocal(aimPos);
    a.gun.position.lerpVectors(p0, aimPos, t);
    a.gun.quaternion.copy(q0);
    a.gun.lookAt(headPos);
    q1.copy(a.gun.quaternion);
    a.gun.quaternion.slerpQuaternions(q0, q1, t);
  });
}

export async function spinDrum(i) {
  const drum = actors[i].gun.userData.drum;
  await tween(1.1, t => { drum.rotation.y = t * Math.PI * 6; });
}

export async function lowerGun(i) {
  const a = actors[i];
  scene.attach(a.gun);
  const p0 = a.gun.position.clone(), q0 = a.gun.quaternion.clone();
  const home = a.gun.userData.home;
  const q1 = new THREE.Quaternion().setFromEuler(home.rot);
  await tween(0.8, t => {
    a.ch.applyPose(lerpPose(POSES.aim, POSES.sit, t));
    a.gun.position.lerpVectors(p0, home.pos, t);
    a.gun.quaternion.slerpQuaternions(q0, q1, t);
  });
  a.ch.busy = false;
}

export async function shoot(i, bang) {
  const a = actors[i];
  if (!bang) {
    await tween(0.25, t => { a.ch.head.rotation.z = 0.12 + Math.sin(t * Math.PI) * 0.12; });
    return;
  }
  const muzzle = new THREE.Vector3();
  a.gun.getWorldPosition(muzzle);
  flashLight.position.copy(muzzle);
  scene.attach(a.gun);
  const gp0 = a.gun.position.clone();
  const fall = a.seat.pos.clone().normalize().multiplyScalar(-0.25);
  const target = gp0.clone().add(fall);
  target.y = TABLE_Y + 0.05;
  await tween(0.9, t => {
    flashLight.intensity = Math.max(0, 1 - t * 5) * 60;
    a.ch.applyPose(lerpPose(POSES.aim, POSES.dead, Math.min(1, t * 1.6)));
    a.gun.position.lerpVectors(gp0, target, Math.min(1, t * 1.3));
    a.gun.rotation.z += 0.08;
  }, t => t);
  flashLight.intensity = 0;
  a.ch.dead = true;
  a.label.classList.add('dead');
}

// ---------- Étiquettes & bulles ----------
const tmp = new THREE.Vector3();
function updateLabels() {
  const w = container.clientWidth, h = container.clientHeight;
  for (const a of actors) {
    a.ch.headCenter.getWorldPosition(tmp);
    tmp.y += 0.45;
    tmp.project(camera);
    const behind = tmp.z > 1;
    a.label.style.transform = `translate(-50%, -100%) translate(${(tmp.x * 0.5 + 0.5) * w}px, ${(-tmp.y * 0.5 + 0.5) * h}px)`;
    a.label.style.visibility = behind ? 'hidden' : '';
  }
}

export function setLabel(i, { active, shots, dead }) {
  const a = actors[i];
  a.label.classList.toggle('active', !!active);
  a.label.classList.toggle('dead', !!dead);
  a.label.querySelector('.tag-shots').innerHTML = dead ? '☠'
    : '<span class="shot">●</span>'.repeat(shots) + '○'.repeat(6 - shots);
}

export function say(i, text, liar = false) {
  const a = actors[i];
  a.label.querySelectorAll('.bubble').forEach(b => b.remove());
  const b = document.createElement('div');
  b.className = 'bubble' + (liar ? ' liar' : '');
  b.textContent = text;
  a.label.prepend(b);
  if (liar) {
    a.ch.busy = true;
    tween(0.5, t => { a.ch.torso.rotation.x = POSES.sit.torsoX + Math.sin(t * Math.PI) * 0.25; })
      .then(() => { a.ch.busy = a.ch.dead; });
  }
}

export function clearBubbles() {
  labelsEl.querySelectorAll('.bubble').forEach(b => b.remove());
}
export const _debug = () => ({ actors, scene, camera, roam });
