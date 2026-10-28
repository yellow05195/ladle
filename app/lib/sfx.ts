/**
 * The hall's sounds (v20), synthesised with WebAudio: no file is downloaded.
 * OFF by default; the speaker toggle in the top bar turns them on and the
 * choice is remembered (localStorage, wrapped: private windows may refuse).
 * The first sound only plays after a click (the toggle itself).
 *
 *   room    a filtered brown-noise room tone with a slow low murmur (~ -30 dB), looping while on
 *   tok     a soft wooden knock per entry
 *   tick    a small brass tick per slot over the last 10 slots
 *   latch   a short clack at the seal
 *   whoosh  a soft whoosh on the decisive turn
 *   pour    a soft plop per ball served (at most 8 audible)
 *   chime   one warm two-note chime after the reveal, identical for every result
 *   clack   a ball lands in the cage (quiet)
 *
 * No coin sound, siren, bell, cheer, fanfare or sad sound.
 */
const KEY = "ladle.sound";
type Listener = (on: boolean) => void;

let ctx: AudioContext | null = null;
let enabled: boolean | null = null;
let room: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
const listeners = new Set<Listener>();

export function soundOn(): boolean {
  if (enabled === null) {
    try { enabled = typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1"; } catch { enabled = false; }
  }
  return enabled;
}

export function setSound(on: boolean): void {
  enabled = on;
  try { window.localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* storage refused: the choice lasts this page */ }
  if (on) { audio()?.resume().catch(() => {}); startRoom(); } else stopRoom();
  listeners.forEach((l) => l(on));
}

export function onSound(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    try { ctx = new C(); } catch { return null; }
  }
  return ctx;
}

function noise(a: AudioContext, seconds: number, brown = false): AudioBuffer {
  const b = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * seconds)), a.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function startRoom(): void {
  const a = audio();
  if (!a || room) return;
  const src = a.createBufferSource();
  src.buffer = noise(a, 6, true);
  src.loop = true;
  const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
  const gain = a.createGain(); gain.gain.value = 0.0001;
  gain.gain.exponentialRampToValueAtTime(0.03, a.currentTime + 1.2);
  // a slow low murmur: the filter breathes
  const lfo = a.createOscillator(); lfo.frequency.value = 0.07;
  const lfoGain = a.createGain(); lfoGain.gain.value = 140;
  lfo.connect(lfoGain).connect(lp.frequency);
  src.connect(lp).connect(gain).connect(a.destination);
  src.start(); lfo.start();
  room = { src, gain };
}

function stopRoom(): void {
  const a = audio();
  if (!a || !room) return;
  const r = room;
  room = null;
  r.gain.gain.cancelScheduledValues(a.currentTime);
  r.gain.gain.setValueAtTime(Math.max(0.0001, r.gain.gain.value), a.currentTime);
  r.gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.4);
  setTimeout(() => { try { r.src.stop(); } catch { /* stopped */ } }, 500);
}

export type Sfx = "clack" | "tick" | "whoosh" | "settle" | "tok" | "latch" | "pour" | "chime";

export function play(kind: Sfx): void {
  if (!soundOn()) return;
  const a = audio();
  if (!a || a.state === "closed") return;
  if (a.state === "suspended") a.resume().catch(() => {});
  if (!room) startRoom();
  const t = a.currentTime + 0.01;
  const out = a.createGain();
  out.gain.value = 0.5;
  out.connect(a.destination);
  const knock = (freq: number, q: number, peak: number, dur: number, thump: [number, number]) => {
    const src = a.createBufferSource(); src.buffer = noise(a, dur + 0.02);
    const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    const g = a.createGain(); env(g, t, peak, 0.002, dur);
    src.connect(bp).connect(g).connect(out); src.start(t); src.stop(t + dur + 0.03);
    const o = a.createOscillator(); o.frequency.setValueAtTime(thump[0], t); o.frequency.exponentialRampToValueAtTime(thump[1], t + dur);
    const g2 = a.createGain(); env(g2, t, peak * 0.5, 0.002, dur + 0.02);
    o.connect(g2).connect(out); o.start(t); o.stop(t + dur + 0.05);
  };
  if (kind === "clack") knock(2400 + Math.random() * 600, 3, 0.2, 0.05, [420, 160]);
  else if (kind === "tok") knock(900, 2.2, 0.35, 0.07, [260, 140]);
  else if (kind === "latch") knock(3200, 4, 0.45, 0.05, [600, 220]);
  else if (kind === "pour") {
    const o = a.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(190, t + 0.09);
    const g = a.createGain(); env(g, t, 0.14, 0.004, 0.1);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.13);
  } else if (kind === "tick") {
    const o = a.createOscillator(); o.type = "triangle"; o.frequency.value = 1760;
    const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200;
    const g = a.createGain(); env(g, t, 0.06, 0.001, 0.03);
    o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + 0.05);
  } else if (kind === "whoosh") {
    const src = a.createBufferSource(); src.buffer = noise(a, 1.2);
    const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(280, t); bp.frequency.exponentialRampToValueAtTime(1600, t + 0.55); bp.frequency.exponentialRampToValueAtTime(360, t + 1.1);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    src.connect(bp).connect(g).connect(out); src.start(t); src.stop(t + 1.2);
  } else {
    // chime (and the v18 "settle"): two warm notes, the same for every result
    [587.33, 880].forEach((f, i) => {
      const o = a.createOscillator(); o.type = "sine"; o.frequency.value = f;
      const g = a.createGain(); const s = t + i * 0.12;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.12, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 1.1);
      o.connect(g).connect(out); o.start(s); o.stop(s + 1.15);
    });
  }
}
