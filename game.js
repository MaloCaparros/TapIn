'use strict';

/* =========================================================
 *  TapIn – Poker Menteur
 *  Jeu de bluff : poker menteur + roulette russe.
 * ========================================================= */

// ---------- Cartes ----------
const SUITS = ['♣', '♦', '♥', '♠'];            // ordre croissant pour départager les couleurs
const SUIT_NAMES = ['trèfle', 'carreau', 'cœur', 'pique'];
const RANK_LABEL = { 11: 'V', 12: 'D', 13: 'R', 14: 'A' };
const RANK_NAME = { 11: 'Valet', 12: 'Dame', 13: 'Roi', 14: 'As' };
const RANK_PLURAL = { 11: 'Valets', 12: 'Dames', 13: 'Rois', 14: 'As' };
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const CARDS_PER_PLAYER = 3;

const label = r => RANK_LABEL[r] || String(r);
const rName = r => RANK_NAME[r] || String(r);
const rPlural = r => RANK_PLURAL[r] || String(r);
const de = r => (r === 14 ? "d'" : 'de ') + rPlural(r);
const au = r => (r === 14 ? "à l'As" : 'au ' + rName(r));

function newDeck() {
  const d = [];
  for (const r of RANKS) for (let s = 0; s < 4; s++) d.push({ r, s });
  return d;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Annonces ----------
const TYPES = [
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
const STRAIGHT_HIGHS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

// Liste ordonnée de toutes les annonces possibles (index = force).
const ALL = [];
const KEY = new Map();
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

function claimText(c) {
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

// Analyse d'un ensemble de cartes pour tester les annonces rapidement.
function analyze(cards) {
  const cnt = new Array(15).fill(0);
  const suit = [0, 0, 0, 0];
  const has = new Uint8Array(15 * 4);
  for (const c of cards) { cnt[c.r]++; suit[c.s]++; has[c.r * 4 + c.s] = 1; }
  cnt[1] = cnt[14];
  for (let s = 0; s < 4; s++) has[1 * 4 + s] = has[14 * 4 + s];
  return { cnt, suit, has };
}

function holds(c, A) {
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

// Cartes qui « participent » à une annonce (pour la surbrillance à la révélation).
function participates(card, c) {
  switch (c.t) {
    case 0: case 1: case 3: case 7: return card.r === c.a;
    case 2: case 6: return card.r === c.a || card.r === c.b;
    case 4: return straightRanks(c.a).includes(card.r);
    case 5: return card.s === c.s;
    case 8: return card.s === c.s && straightRanks(c.a).includes(card.r);
  }
  return false;
}

// ---------- IA ----------
// Estime par Monte-Carlo la probabilité que chaque annonce existe sur la table,
// à partir de la main du bot et du nombre de cartes inconnues.
function estimate(ownHand, unknownCount, samples = 400) {
  const owned = new Set(ownHand.map(c => c.r * 4 + c.s));
  const rest = newDeck().filter(c => !owned.has(c.r * 4 + c.s));
  const hits = new Float32Array(ALL.length);
  for (let k = 0; k < samples; k++) {
    // tirage partiel de Fisher-Yates
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

function botDecide(p) {
  const total = state.players.filter(x => x.alive).length * CARDS_PER_PLAYER;
  const P = estimate(p.hand, total - p.hand.length);
  const cur = state.claim;
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
    // pondéré vers l'annonce la plus basse
    const pick = Math.floor(Math.pow(Math.random(), 1.6) * window);
    return { claim: cands[pick] };
  }

  if (cur < 0 || Math.random() < per.bluff) {
    // bluff : la meilleure annonce parmi les quelques suivantes
    let best = cur + 1;
    for (let i = cur + 1; i < Math.min(ALL.length, cur + 8); i++) if (P[i] > P[best]) best = i;
    return { claim: best, bluff: true };
  }
  return { call: true };
}

// ---------- Personnages ----------
const ROSTER = [
  { name: 'Renarde', emoji: '🦊', persona: { call: 0.40, target: 0.55, bluff: 0.35 },
    lines: { claim: ['Facile.', 'Je suis large.', 'Suis-moi si tu l\'oses.'], liar: ['Menteur !', 'Tu bluffes, mon chou.'] } },
  { name: 'Gaston', emoji: '🐗', persona: { call: 0.30, target: 0.68, bluff: 0.15 },
    lines: { claim: ['Hmpf.', 'Ça passe.', 'J\'monte.'], liar: ['MENTEUR !', 'Retourne tout !'] } },
  { name: 'Mme Chouette', emoji: '🦉', persona: { call: 0.45, target: 0.75, bluff: 0.08 },
    lines: { claim: ['Calculé.', 'Probable.', 'Hm-hm.'], liar: ['Statistiquement : menteur.', 'Je doute.'] } },
];

// ---------- État ----------
const state = {
  players: [],
  claim: -1,       // index dans ALL
  claimer: -1,     // index joueur
  turn: 0,
  busy: false,
  lastLoser: 0,
};

const $ = id => document.getElementById(id);
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
const wait = ms => new Promise(r => setTimeout(r, ms));

function newRevolver() { return { bullet: Math.floor(Math.random() * 6), pulled: 0 }; }

function startGame(nOpp) {
  state.players = [{ name: 'Toi', emoji: '🎩', isHuman: true, alive: true, hand: [], rev: newRevolver() }];
  shuffle(ROSTER.slice()).slice(0, nOpp).forEach(r =>
    state.players.push({ ...r, isHuman: false, alive: true, hand: [], rev: newRevolver() }));
  $('log').innerHTML = '';
  $('menu').classList.add('hidden');
  $('game').classList.remove('hidden');
  buildSeats();
  startRound(Math.floor(Math.random() * state.players.length));
}

function nextAlive(i) {
  const n = state.players.length;
  let j = i;
  do { j = (j + 1) % n; } while (!state.players[j].alive);
  return j;
}

function startRound(starter) {
  const deck = shuffle(newDeck());
  for (const p of state.players) p.hand = p.alive ? deck.splice(0, CARDS_PER_PLAYER) : [];
  state.claim = -1;
  state.claimer = -1;
  state.turn = starter;
  state.revealed = false;
  log(`— Nouvelle manche. ${state.players[starter].name} commence. —`);
  clearBubbles();
  render();
  nextTurn();
}

async function nextTurn() {
  render();
  const p = state.players[state.turn];
  if (p.isHuman) { setupForm(); return; }
  state.busy = true;
  render();
  await wait(900 + Math.random() * 900);
  const d = botDecide(p);
  state.busy = false;
  if (d.call) doCall(state.turn);
  else doClaim(state.turn, d.claim);
}

function doClaim(pid, idx) {
  const p = state.players[pid];
  state.claim = idx;
  state.claimer = pid;
  const txt = claimText(ALL[idx]);
  log(`${p.emoji} ${p.name} annonce : <b>${txt}</b>`);
  bubble(pid, p.isHuman ? txt : `${txt} — ${rand(p.lines.claim)}`);
  state.turn = nextAlive(pid);
  nextTurn();
}

async function doCall(pid) {
  const p = state.players[pid];
  const claimer = state.players[state.claimer];
  const c = ALL[state.claim];
  log(`${p.emoji} ${p.name} crie <b>« Menteur ! »</b> à ${claimer.name}.`);
  bubble(pid, p.isHuman ? 'Menteur !' : rand(p.lines.liar), true);
  state.busy = true;
  state.revealed = true;
  render();

  const all = state.players.flatMap(x => x.hand);
  const exists = holds(c, analyze(all));
  await wait(1800);

  const loserId = exists ? pid : state.claimer;
  const loser = state.players[loserId];
  const verdict = exists
    ? `<b>${claimText(c)}</b> existe bien sur la table ! ${p.name} accusait à tort.`
    : `Aucune trace de <b>${claimText(c)}</b>. ${claimer.name} bluffait !`;
  log(verdict);
  state.lastLoser = loserId;
  roulette(loserId, verdict);
}

// ---------- Roulette ----------
function drawCylinder(rev) {
  const cyl = $('cylinder');
  cyl.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const ch = document.createElement('div');
    ch.className = 'chamber' + (i < rev.pulled ? ' fired' : '');
    ch.style.left = 50 + Math.cos(a) * 32 + '%';
    ch.style.top = 50 + Math.sin(a) * 32 + '%';
    cyl.appendChild(ch);
  }
}

function roulette(loserId, verdict) {
  const loser = state.players[loserId];
  const rev = loser.rev;
  const odds = `1 chance sur ${6 - rev.pulled}`;
  showOverlay(
    loser.isHuman ? 'À toi de tirer…' : `${loser.emoji} ${loser.name} doit tirer`,
    `${verdict}<br><br>Revolver : ${rev.pulled} coup(s) déjà tiré(s) — <b>${odds}</b> d'y passer.`,
    loser.isHuman ? 'Appuyer sur la détente' : 'Regarder',
    async () => {
      $('overlay-btn').disabled = true;
      const cyl = $('cylinder');
      cyl.classList.remove('spin'); void cyl.offsetWidth; cyl.classList.add('spin');
      await wait(1300);
      const bang = rev.pulled === rev.bullet;
      rev.pulled++;
      drawCylinder(rev);
      const box = document.querySelector('.overlay-box');
      if (bang) {
        loser.alive = false;
        box.classList.add('flash', 'shake');
        $('overlay-title').textContent = 'PAN !';
        $('overlay-body').innerHTML = loser.isHuman
          ? 'Le monde devient noir. Tu as perdu.'
          : `${loser.emoji} ${loser.name} s'effondre sur la table.`;
        log(`💥 PAN ! ${loser.name} est éliminé·e.`);
      } else {
        $('overlay-title').textContent = '*clic*';
        $('overlay-body').innerHTML = loser.isHuman
          ? 'Chambre vide. Tu respires encore.'
          : `${loser.emoji} ${loser.name} rouvre les yeux. Chambre vide.`;
        log(`*clic* — ${loser.name} survit (${rev.pulled}/6).`);
      }
      setTimeout(() => box.classList.remove('flash', 'shake'), 700);
      render();
      const alive = state.players.filter(x => x.alive);
      $('overlay-btn').disabled = false;
      if (!state.players[0].alive || alive.length === 1) {
        $('overlay-btn').textContent = 'Suite';
        $('overlay-btn').onclick = () => endGame();
      } else {
        $('overlay-btn').textContent = 'Manche suivante';
        $('overlay-btn').onclick = () => {
          hideOverlay();
          state.busy = false;
          startRound(loser.alive ? loserId : nextAlive(loserId));
        };
      }
    },
    rev
  );
}

function endGame() {
  const human = state.players[0];
  const winner = state.players.find(x => x.alive);
  const won = human.alive;
  showOverlay(
    won ? 'Dernier debout !' : 'Partie terminée',
    won ? 'Tu quittes le bar avec la cagnotte… et ta tête.'
        : `${winner && state.players.filter(x => x.alive).length === 1 ? winner.emoji + ' ' + winner.name + ' remporte la partie.' : 'Les autres continuent sans toi.'}`,
    'Rejouer',
    () => { hideOverlay(); $('game').classList.add('hidden'); $('menu').classList.remove('hidden'); }
  );
}

function showOverlay(title, body, btn, onClick, rev) {
  $('overlay-title').textContent = title;
  $('overlay-body').innerHTML = body;
  $('overlay-btn').textContent = btn;
  $('overlay-btn').disabled = false;
  $('overlay-btn').onclick = onClick;
  if (rev) { $('revolver').classList.remove('hidden'); drawCylinder(rev); }
  else $('revolver').classList.add('hidden');
  $('overlay').classList.remove('hidden');
}
function hideOverlay() { $('overlay').classList.add('hidden'); }

// ---------- Rendu ----------
const SEAT_POS = {
  2: [[50, 78], [50, 8]],
  3: [[50, 78], [12, 40], [88, 40]],
  4: [[50, 78], [10, 42], [50, 8], [90, 42]],
};

function buildSeats() {
  const seats = $('seats');
  seats.innerHTML = '';
  const pos = SEAT_POS[state.players.length];
  state.players.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'seat';
    el.id = 'seat-' + i;
    el.style.left = pos[i][0] + '%';
    el.style.top = pos[i][1] + '%';
    el.innerHTML = `<div class="avatar">${p.emoji}</div><div class="name">${p.name}</div>
      <div class="chambers"></div><div class="hand"></div>`;
    seats.appendChild(el);
  });
}

function cardEl(card, faceUp, hl) {
  const d = document.createElement('div');
  if (!faceUp) { d.className = 'card back'; return d; }
  d.className = 'card' + (card.s === 1 || card.s === 2 ? ' red' : '') + (hl ? ' hl' : '');
  d.innerHTML = `<span>${label(card.r)}</span><span class="suit">${SUITS[card.s]}</span>`;
  return d;
}

function render() {
  state.players.forEach((p, i) => {
    const el = $('seat-' + i);
    el.classList.toggle('dead', !p.alive);
    el.classList.toggle('active', p.alive && i === state.turn && !state.revealed);
    const shots = '<span class="shot">●</span>'.repeat(p.rev.pulled) + '○'.repeat(6 - p.rev.pulled);
    el.querySelector('.chambers').innerHTML = p.alive ? `🔫 ${shots}` : '☠ éliminé·e';
    const hand = el.querySelector('.hand');
    hand.innerHTML = '';
    const c = state.claim >= 0 ? ALL[state.claim] : null;
    for (const card of p.hand) {
      const faceUp = p.isHuman || state.revealed;
      hand.appendChild(cardEl(card, faceUp, state.revealed && c && participates(card, c)));
    }
  });

  if (state.claim >= 0) {
    $('claim-text').textContent = claimText(ALL[state.claim]);
    const cl = state.players[state.claimer];
    $('claim-by').textContent = `par ${cl.emoji} ${cl.name}`;
  } else {
    $('claim-text').textContent = '—';
    $('claim-by').textContent = '';
  }

  const me = state.players[0];
  const myTurn = state.turn === 0 && me.alive && !state.busy && !state.revealed;
  const cur = state.players[state.turn];
  $('turn-info').textContent = !me.alive ? 'Tu regardes depuis l\'au-delà…'
    : state.revealed ? 'Révélation des cartes…'
    : myTurn ? (state.claim < 0 ? 'À toi d\'ouvrir les enchères.' : 'À toi : surenchéris ou crie « Menteur ! »')
    : `${cur.emoji} ${cur.name} réfléchit…`;
  for (const id of ['sel-type', 'sel-a', 'sel-b', 'sel-s', 'btn-claim', 'btn-min'])
    $(id).disabled = !myTurn || state.claim === ALL.length - 1;
  $('btn-liar').disabled = !myTurn || state.claim < 0;
}

function bubble(pid, text, liar = false) {
  const el = $('seat-' + pid);
  el.querySelectorAll('.bubble').forEach(b => b.remove());
  const b = document.createElement('div');
  b.className = 'bubble' + (liar ? ' liar' : '');
  b.textContent = text;
  el.appendChild(b);
}
function clearBubbles() { document.querySelectorAll('.bubble').forEach(b => b.remove()); }

function log(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  $('log').prepend(d);
}

// ---------- Formulaire joueur ----------
function fillSelect(sel, items) {
  const prev = sel.value;
  sel.innerHTML = items.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  if (items.some(([v]) => String(v) === prev)) sel.value = prev;
}

function updateFormFields() {
  const t = TYPES[+$('sel-type').value];
  const ranks = t.straight ? STRAIGHT_HIGHS : RANKS;
  fillSelect($('sel-a'), ranks.map(r => [r, t.straight ? (r === 14 ? "à l'As" : 'au ' + rName(r)) : rName(r)]));
  fillSelect($('sel-b'), RANKS.map(r => [r, (t.id === 'full' ? 'par ' : 'et ') + rName(r)]));
  fillSelect($('sel-s'), SUITS.map((s, i) => [i, `${s} ${SUIT_NAMES[i]}`]));
  $('sel-a').classList.toggle('hidden', !t.a);
  $('sel-b').classList.toggle('hidden', !t.b);
  $('sel-s').classList.toggle('hidden', !t.s);
}

function setFormTo(c) {
  $('sel-type').value = c.t;
  updateFormFields();
  if (TYPES[c.t].a) $('sel-a').value = c.a;
  if (TYPES[c.t].b) $('sel-b').value = c.b;
  if (TYPES[c.t].s) $('sel-s').value = c.s;
}

function formClaimIdx() {
  const t = +$('sel-type').value;
  const T = TYPES[t];
  let a = T.a ? +$('sel-a').value : 0;
  let b = T.b ? +$('sel-b').value : 0;
  const s = T.s ? +$('sel-s').value : -1;
  if (T.b && a === b) return { err: 'Les deux hauteurs doivent être différentes.' };
  if (t === 2 && b > a) [a, b] = [b, a];
  const idx = KEY.get(`${t}|${a}|${b}|${s}`);
  return idx === undefined ? { err: 'Annonce invalide.' } : { idx };
}

function setupForm() {
  $('form-error').textContent = '';
  if (state.claim < ALL.length - 1) setFormTo(ALL[state.claim + 1]);
  render();
}

function initForm() {
  fillSelect($('sel-type'), TYPES.map((t, i) => [i, t.name]));
  updateFormFields();
  $('sel-type').onchange = updateFormFields;
  $('btn-min').onclick = () => setFormTo(ALL[state.claim + 1]);
  $('btn-claim').onclick = () => {
    const r = formClaimIdx();
    if (r.err) { $('form-error').textContent = r.err; return; }
    if (r.idx <= state.claim) {
      $('form-error').textContent = 'Ton annonce doit être plus forte que l\'annonce en cours.';
      return;
    }
    $('form-error').textContent = '';
    doClaim(0, r.idx);
  };
  $('btn-liar').onclick = () => { $('form-error').textContent = ''; doCall(0); };
  $('start-btn').onclick = () => startGame(+$('opp-count').value);
}

initForm();
