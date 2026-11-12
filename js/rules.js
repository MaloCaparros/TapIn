// Règles du poker menteur : cartes, annonces, vérification et IA.

export const SUITS = ['♣', '♦', '♥', '♠']; // ordre croissant pour départager les couleurs
export const SUIT_NAMES = ['trèfle', 'carreau', 'cœur', 'pique'];
const RANK_LABEL = { 11: 'V', 12: 'D', 13: 'R', 14: 'A' };
const RANK_NAME = { 11: 'Valet', 12: 'Dame', 13: 'Roi', 14: 'As' };
const RANK_PLURAL = { 11: 'Valets', 12: 'Dames', 13: 'Rois', 14: 'As' };
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const STRAIGHT_HIGHS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const CARDS_PER_PLAYER = 3;

export const label = r => RANK_LABEL[r] || String(r);
export const rName = r => RANK_NAME[r] || String(r);
const rPlural = r => RANK_PLURAL[r] || String(r);
const de = r => (r === 14 ? "d'" : 'de ') + rPlural(r);
const au = r => (r === 14 ? "à l'As" : 'au ' + rName(r));

export function newDeck() {
  const d = [];
  for (const r of RANKS) for (let s = 0; s < 4; s++) d.push({ r, s });
  return d;
}

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const TYPES = [
  { id: 'high',  name: 'Carte haute',  a: true },
  { id: 'pair',  name: 'Paire',        a: true },
  { id: 'two',   name: 'Double paire', a: true, b: true },
  { id: 'trips', name: 'Brelan',       a: true },
  { id: 'str',   name: 'Suite',        a: true, straight: true },
  { id: 'flush', name: 'Couleur',      s: true },
  { id: 'full',  name: 'Full',         a: true, b: true },
  { id: 'quads', name: 'Carré',        a: true },
  { id: 'sf',    name: 'Quinte flush', a: true, s: true, straight: true },
];

// Liste ordonnée de toutes les annonces possibles (index = force).
export const ALL = [];
export const KEY = new Map();
(function buildClaims() {
  const add = (t, a = 0, b = 0, s = -1) => {
    const c = { t, a, b, s, idx: ALL.length };
    ALL.push(c);
    KEY.set(`${t}|${a}|${b}|${s}`, c.idx);
  };
  for (const r of RANKS) add(0, r);
  for (const r of RANKS) add(1, r);
  for (const a of RANKS) for (const b of RANKS) if (b < a) add(2, a, b);
  for (const r of RANKS) add(3, r);
  for (const h of STRAIGHT_HIGHS) add(4, h);
  for (let s = 0; s < 4; s++) add(5, 0, 0, s);
  for (const a of RANKS) for (const b of RANKS) if (b !== a) add(6, a, b);
  for (const r of RANKS) add(7, r);
  for (const h of STRAIGHT_HIGHS) for (let s = 0; s < 4; s++) add(8, h, 0, s);
})();

export function claimText(c) {
  switch (c.t) {
    case 0: return `Carte haute : ${rName(c.a)}`;
    case 1: return `Paire ${de(c.a)}`;
    case 2: return `Double paire : ${rPlural(c.a)} et ${rPlural(c.b)}`;
    case 3: return `Brelan ${de(c.a)}`;
    case 4: return `Suite ${au(c.a)}`;
    case 5: return `Couleur à ${SUIT_NAMES[c.s]} ${SUITS[c.s]}`;
    case 6: return `Full : ${rPlural(c.a)} par les ${rPlural(c.b)}`;
    case 7: return `Carré ${de(c.a)}`;
    case 8: return `Quinte flush ${au(c.a)} à ${SUITS[c.s]}`;
  }
}

function straightRanks(h) {
  const rs = [];
  for (let r = h - 4; r <= h; r++) rs.push(r === 1 ? 14 : r);
  return rs;
}

export function analyze(cards) {
  const cnt = new Array(15).fill(0);
  const suit = [0, 0, 0, 0];
  const has = new Uint8Array(15 * 4);
  for (const c of cards) { cnt[c.r]++; suit[c.s]++; has[c.r * 4 + c.s] = 1; }
  cnt[1] = cnt[14];
  for (let s = 0; s < 4; s++) has[4 + s] = has[14 * 4 + s];
  return { cnt, suit, has };
}

export function holds(c, A) {
  const { cnt, suit, has } = A;
  switch (c.t) {
    case 0: return cnt[c.a] >= 1;
    case 1: return cnt[c.a] >= 2;
    case 2: return cnt[c.a] >= 2 && cnt[c.b] >= 2;
    case 3: return cnt[c.a] >= 3;
    case 4: for (let r = c.a - 4; r <= c.a; r++) if (!cnt[r]) return false; return true;
    case 5: return suit[c.s] >= 5;
    case 6: return cnt[c.a] >= 3 && cnt[c.b] >= 2;
    case 7: return cnt[c.a] >= 4;
    case 8: for (let r = c.a - 4; r <= c.a; r++) if (!has[r * 4 + c.s]) return false; return true;
  }
  return false;
}

// Cartes qui « participent » à une annonce (surbrillance à la révélation).
export function participates(card, c) {
  switch (c.t) {
    case 0: case 1: case 3: case 7: return card.r === c.a;
    case 2: case 6: return card.r === c.a || card.r === c.b;
    case 4: return straightRanks(c.a).includes(card.r);
    case 5: return card.s === c.s;
    case 8: return card.s === c.s && straightRanks(c.a).includes(card.r);
  }
  return false;
}

// Probabilité (Monte-Carlo) que chaque annonce existe, vue depuis une main.
export function estimate(ownHand, unknownCount, samples = 400) {
  const owned = new Set(ownHand.map(c => c.r * 4 + c.s));
  const rest = newDeck().filter(c => !owned.has(c.r * 4 + c.s));
  const hits = new Float32Array(ALL.length);
  for (let k = 0; k < samples; k++) {
    for (let i = 0; i < unknownCount; i++) {
      const j = i + Math.floor(Math.random() * (rest.length - i));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const A = analyze(ownHand.concat(rest.slice(0, unknownCount)));
    for (let i = 0; i < ALL.length; i++) if (holds(ALL[i], A)) hits[i]++;
  }
  for (let i = 0; i < ALL.length; i++) hits[i] /= samples;
  return hits;
}

// Décision d'un bot : { call: true } ou { claim: index }.
export function botDecide(p, cur, aliveCount) {
  const total = aliveCount * CARDS_PER_PLAYER;
  const P = estimate(p.hand, total - p.hand.length);
  const per = p.persona;

  if (cur >= 0) {
    const doubt = per.call + (Math.random() - 0.5) * 0.12;
    if (P[cur] < doubt) return { call: true };
  }
  if (cur === ALL.length - 1) return { call: true };

  const cands = [];
  for (let i = cur + 1; i < ALL.length; i++) if (P[i] >= per.target) cands.push(i);
  if (cands.length) {
    const window = Math.min(cands.length, cur < 0 ? 5 : 3);
    const pick = Math.floor(Math.pow(Math.random(), 1.6) * window);
    return { claim: cands[pick] };
  }

  if (cur < 0 || Math.random() < per.bluff) {
    let best = cur + 1;
    for (let i = cur + 1; i < Math.min(ALL.length, cur + 8); i++) if (P[i] > P[best]) best = i;
    return { claim: best, bluff: true };
  }
  return { call: true };
}
