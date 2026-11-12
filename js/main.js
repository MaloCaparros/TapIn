// Déroulement d'une partie de TapIn.
import * as R from './rules.js';
import * as W from './world.js';
import * as S from './audio.js';

const { ALL, TYPES, KEY, SUITS, SUIT_NAMES, RANKS, STRAIGHT_HIGHS, claimText } = R;

const HUMAN = {
  name: 'Toi', isHuman: true,
  look: {}, // le modèle de référence : cheveux noirs en pics, manteau gris, écharpe
};
const ROSTER = [
  { name: 'Renarde', persona: { call: 0.40, target: 0.55, bluff: 0.35 },
    look: { hairStyle: 'ponytail', hair: '#d9662b', coat: '#2f5d50', scarf: '#e8d3b0', cuff: '#e8d3b0', pants: '#3a2e2a' },
    lines: { claim: ['Facile.', 'Je suis large.', "Suis-moi si tu l'oses."], liar: ['Menteur !', 'Tu bluffes, mon chou.'] } },
  { name: 'Gaston', persona: { call: 0.30, target: 0.68, bluff: 0.15 },
    look: { hairStyle: 'short', beard: true, hair: '#5a3a22', coat: '#7a4a2a', scarf: '#a33a33', cuff: '#a33a33', width: 1.12 },
    lines: { claim: ['Hmpf.', 'Ça passe.', "J'monte."], liar: ['MENTEUR !', 'Retourne tout !'] } },
  { name: 'Mme Chouette', persona: { call: 0.45, target: 0.75, bluff: 0.08 },
    look: { hairStyle: 'bun', glasses: true, hair: '#c9c4bd', coat: '#5b4b78', scarf: '#d8b04a', cuff: '#d8b04a' },
    lines: { claim: ['Calculé.', 'Probable.', 'Hm-hm.'], liar: ['Statistiquement : menteur.', 'Je doute.'] } },
];

const state = { players: [], claim: -1, claimer: -1, turn: 0, busy: true, revealed: false };
const $ = id => document.getElementById(id);
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Partie ----------
async function startGame(nOpp) {
  S.unlock();
  state.players = [{ ...HUMAN, alive: true, hand: [], rev: newRevolver() }];
  R.shuffle(ROSTER.slice()).slice(0, nOpp)
    .forEach(r => state.players.push({ ...r, isHuman: false, alive: true, hand: [], rev: newRevolver() }));
  $('log').innerHTML = '';
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  state.busy = true;
  state.claim = -1;
  state.turn = -1;
  render();
  setInfo('Les joueurs arrivent au bar…');
  W.setupPlayers(state.players);
  refreshLabels();
  await W.intro();
  startRound(Math.floor(Math.random() * state.players.length));
}

function newRevolver() { return { bullet: Math.floor(Math.random() * 6), pulled: 0 }; }

function nextAlive(i) {
  const n = state.players.length;
  let j = i;
  do { j = (j + 1) % n; } while (!state.players[j].alive);
  return j;
}

async function startRound(starter) {
  const deck = R.shuffle(R.newDeck());
  for (const p of state.players) p.hand = p.alive ? deck.splice(0, R.CARDS_PER_PLAYER) : [];
  state.claim = -1;
  state.claimer = -1;
  state.revealed = false;
  state.busy = true;
  state.turn = starter;
  W.clearBubbles();
  log(`— Nouvelle manche. ${state.players[starter].name} commence. —`);
  setInfo('Distribution…');
  renderHand();
  S.card();
  await W.deal(state.players.map(p => p.hand), 0);
  state.busy = false;
  nextTurn();
}

async function nextTurn() {
  refreshLabels();
  render();
  const p = state.players[state.turn];
  if (p.isHuman) { setupForm(); return; }
  state.busy = true;
  render();
  await sleep(900 + Math.random() * 900);
  const alive = state.players.filter(x => x.alive).length;
  const d = R.botDecide(p, state.claim, alive);
  state.busy = false;
  if (d.call) doCall(state.turn);
  else doClaim(state.turn, d.claim);
}

function doClaim(pid, idx) {
  const p = state.players[pid];
  state.claim = idx;
  state.claimer = pid;
  const txt = claimText(ALL[idx]);
  log(`<b>${p.name}</b> annonce : <b>${txt}</b>`);
  W.say(pid, p.isHuman ? txt : `${txt} — ${rand(p.lines.claim)}`);
  state.turn = nextAlive(pid);
  nextTurn();
}

async function doCall(pid) {
  const p = state.players[pid];
  const claimer = state.players[state.claimer];
  const c = ALL[state.claim];
  log(`<b>${p.name}</b> crie <b>« Menteur ! »</b> à ${claimer.name}.`);
  W.say(pid, p.isHuman ? 'Menteur !' : rand(p.lines.liar), true);
  state.busy = true;
  state.revealed = true;
  refreshLabels();
  render();
  setInfo('On retourne les cartes…');

  const exists = R.holds(c, R.analyze(state.players.flatMap(x => x.hand)));
  S.card();
  await W.reveal(state.players.map(x => x.hand), card => R.participates(card, c));
  await sleep(1400);

  const loserId = exists ? pid : state.claimer;
  const verdict = exists
    ? `<b>${claimText(c)}</b> existe bien ! ${p.name} accusait à tort.`
    : `Aucune trace de <b>${claimText(c)}</b>. ${claimer.name} bluffait !`;
  log(verdict);
  W.clearBubbles();
  roulette(loserId, verdict);
}

// ---------- Roulette ----------
async function roulette(loserId, verdict) {
  const loser = state.players[loserId];
  const rev = loser.rev;
  setInfo('');
  await W.focusActor(loserId);
  await W.raiseGun(loserId);
  panel(
    loser.isHuman ? 'À toi de tirer…' : `${loser.name} doit tirer`,
    `${verdict}<br>Revolver : ${rev.pulled} coup(s) déjà tiré(s) — <b>1 chance sur ${6 - rev.pulled}</b>.`,
    loser.isHuman ? 'Appuyer sur la détente' : 'Regarder',
    async () => {
      hidePanel();
      S.spin();
      await W.spinDrum(loserId);
      await sleep(500);
      const bang = rev.pulled === rev.bullet;
      rev.pulled++;
      if (bang) {
        S.bang();
        document.body.classList.add('flash');
        setTimeout(() => document.body.classList.remove('flash'), 400);
        loser.alive = false;
        await W.shoot(loserId, true);
        log(`💥 PAN ! ${loser.name} s'effondre.`);
      } else {
        S.click();
        await W.shoot(loserId, false);
        log(`*clic* — ${loser.name} survit (${rev.pulled}/6).`);
      }
      refreshLabels();
      await sleep(900);
      const body = bang
        ? (loser.isHuman ? 'Le monde devient noir…' : `${loser.name} ne se relèvera pas.`)
        : (loser.isHuman ? 'Chambre vide. Tu respires encore.' : `${loser.name} rouvre les yeux. Chambre vide.`);
      const over = !state.players[0].alive || state.players.filter(x => x.alive).length === 1;
      panel(bang ? 'PAN !' : '*clic*', body, over ? 'Suite' : 'Manche suivante', async () => {
        hidePanel();
        if (over) return endGame();
        if (!bang) await W.lowerGun(loserId);
        await W.focusTable();
        startRound(loser.alive ? loserId : nextAlive(loserId));
      });
    });
}

function endGame() {
  const won = state.players[0].alive;
  const alive = state.players.filter(x => x.alive);
  panel(
    won ? 'Dernier debout !' : 'Partie terminée',
    won ? 'Tu quittes le bar avec la cagnotte… et ta tête.'
      : alive.length === 1 ? `${alive[0].name} remporte la partie.` : 'Les autres continuent sans toi.',
    'Rejouer',
    () => {
      hidePanel();
      $('hud').classList.add('hidden');
      $('menu').classList.remove('hidden');
      W.setIdleOrbit(true);
    });
}

// ---------- Interface ----------
function panel(title, body, btn, onClick) {
  $('panel-title').textContent = title;
  $('panel-body').innerHTML = body;
  $('panel-btn').textContent = btn;
  $('panel-btn').onclick = onClick;
  $('panel').classList.remove('hidden');
  $('controls').classList.add('hidden');
}
function hidePanel() {
  $('panel').classList.add('hidden');
  $('controls').classList.remove('hidden');
}

function setInfo(t) { $('turn-info').textContent = t; }

function refreshLabels() {
  state.players.forEach((p, i) => W.setLabel(i, {
    active: p.alive && i === state.turn && !state.revealed && !state.busy,
    shots: p.rev.pulled, dead: !p.alive,
  }));
}

function renderHand() {
  const me = state.players[0];
  $('my-hand').innerHTML = me.alive ? me.hand.map(c =>
    `<div class="card${c.s === 1 || c.s === 2 ? ' red' : ''}"><span>${R.label(c.r)}</span><span class="suit">${SUITS[c.s]}</span></div>`
  ).join('') : '';
}

function render() {
  if (state.claim >= 0) {
    $('claim-text').textContent = claimText(ALL[state.claim]);
    $('claim-by').textContent = `par ${state.players[state.claimer].name}`;
  } else {
    $('claim-text').textContent = '—';
    $('claim-by').textContent = '';
  }
  const me = state.players[0];
  const myTurn = state.turn === 0 && me.alive && !state.busy && !state.revealed;
  const cur = state.players[state.turn];
  if (!state.revealed && state.turn >= 0) {
    setInfo(!me.alive ? "Tu regardes depuis l'au-delà…"
      : myTurn ? (state.claim < 0 ? "À toi d'ouvrir les enchères." : 'À toi : surenchéris ou crie « Menteur ! »')
      : `${cur.name} réfléchit…`);
  }
  for (const id of ['sel-type', 'sel-a', 'sel-b', 'sel-s', 'btn-claim', 'btn-min'])
    $(id).disabled = !myTurn || state.claim === ALL.length - 1;
  $('btn-liar').disabled = !myTurn || state.claim < 0;
}

function log(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  $('log').prepend(d);
}

// ---------- Formulaire d'annonce ----------
function fillSelect(sel, items) {
  const prev = sel.value;
  sel.innerHTML = items.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  if (items.some(([v]) => String(v) === prev)) sel.value = prev;
}

function updateFormFields() {
  const t = TYPES[+$('sel-type').value];
  const ranks = t.straight ? STRAIGHT_HIGHS : RANKS;
  fillSelect($('sel-a'), ranks.map(r => [r, t.straight ? (r === 14 ? "à l'As" : 'au ' + R.rName(r)) : R.rName(r)]));
  fillSelect($('sel-b'), RANKS.map(r => [r, (t.id === 'full' ? 'par ' : 'et ') + R.rName(r)]));
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

function initUI() {
  fillSelect($('sel-type'), TYPES.map((t, i) => [i, t.name]));
  updateFormFields();
  $('sel-type').onchange = updateFormFields;
  $('btn-min').onclick = () => setFormTo(ALL[state.claim + 1]);
  $('btn-claim').onclick = () => {
    const r = formClaimIdx();
    if (r.err) { $('form-error').textContent = r.err; return; }
    if (r.idx <= state.claim) {
      $('form-error').textContent = "Ton annonce doit être plus forte que l'annonce en cours.";
      return;
    }
    $('form-error').textContent = '';
    doClaim(0, r.idx);
  };
  $('btn-liar').onclick = () => { $('form-error').textContent = ''; doCall(0); };
  $('start-btn').onclick = () => startGame(+$('opp-count').value);
  $('log-toggle').onclick = () => $('log-wrap').classList.toggle('open');
}

window.TAPIN = state; // pratique pour déboguer dans la console
W.init($('scene'), $('labels'));
initUI();
