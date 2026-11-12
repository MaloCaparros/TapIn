// Effets sonores synthétisés avec la Web Audio API (aucun fichier à charger).
let ctx;

export function unlock() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}

function noise(dur) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function env(node, t0, peak, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  node.connect(g);
  g.connect(ctx.destination);
  return g;
}

export function click() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const n = noise(0.05);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 2500;
  n.connect(f);
  env(f, t, 0.6, 0.05);
  n.start(t);
}

export function spin() {
  if (!ctx) return;
  for (let i = 0; i < 12; i++) setTimeout(click, i * 40 + i * i * 4);
}

export function bang() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const n = noise(0.8);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(4000, t);
  f.frequency.exponentialRampToValueAtTime(200, t + 0.6);
  n.connect(f);
  env(f, t, 1.2, 0.8);
  n.start(t);
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
  env(o, t, 1, 0.45);
  o.start(t); o.stop(t + 0.5);
}

export function card() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const n = noise(0.08);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
  n.connect(f);
  env(f, t, 0.25, 0.08);
  n.start(t);
}
