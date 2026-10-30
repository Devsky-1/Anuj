// Procedural Web Audio API sound effects & ambient synthesizer
import { clamp } from './rules';

let actx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let mGain: GainNode | null = null;
let sGain: GainNode | null = null;
let aGain: GainNode | null = null;
let muted = false;
let masterVol = 1;
let sfxVol = 1;
let ambVol = 1;

export function setAudioVolumes(master: number, sfx: number, amb: number, isMuted = muted) {
  masterVol = clamp(master, 0, 1);
  sfxVol = clamp(sfx, 0, 1);
  ambVol = clamp(amb, 0, 1);
  muted = isMuted;
  if (!mGain || !sGain || !aGain) return;
  mGain.gain.value = muted ? 0 : masterVol;
  sGain.gain.value = sfxVol;
  aGain.gain.value = ambVol;
}

export function toggleMute(): boolean {
  muted = !muted;
  setAudioVolumes(masterVol, sfxVol, ambVol, muted);
  return muted;
}

export function isAudioMuted(): boolean {
  return muted;
}

export function audioInit() {
  if (actx) {
    if (actx.state === 'suspended') {
      actx.resume().catch(() => {});
    }
    return;
  }
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    actx = new AC();
    mGain = actx.createGain();
    mGain.connect(actx.destination);
    sGain = actx.createGain();
    sGain.connect(mGain);
    aGain = actx.createGain();
    aGain.connect(mGain);
    setAudioVolumes(masterVol, sfxVol, ambVol, muted);

    noiseBuf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.6), actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    const w = actx.createBufferSource();
    w.buffer = noiseBuf;
    w.loop = true;
    const wf = actx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 420;
    const wg = actx.createGain();
    wg.gain.value = 0.05;
    const lfo = actx.createOscillator();
    lfo.frequency.value = 0.12;
    const lg = actx.createGain();
    lg.gain.value = 0.025;
    lfo.connect(lg);
    lg.connect(wg.gain);
    w.connect(wf);
    wf.connect(wg);
    wg.connect(aGain);
    w.start();
    lfo.start();
  } catch {
    actx = null;
  }
}

export const SND_EN = { f: 1800, d: 0.28, th: 140 };

export function sndShot(vol: number, far: boolean, sp?: { f: number; d: number; th: number }) {
  if (!actx || !noiseBuf || !sGain) return;
  const spec = sp || { f: 4200, d: 0.28, th: 110 };
  const t = actx.currentTime;
  const pitchVar = 0.94 + Math.random() * 0.12;

  const n = actx.createBufferSource();
  n.buffer = noiseBuf;
  const f = actx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime((far ? 1800 : spec.f) * pitchVar, t);
  f.frequency.exponentialRampToValueAtTime(260, t + spec.d * 0.8);
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + spec.d);
  n.connect(f);
  f.connect(g);
  g.connect(sGain);
  n.start(t);
  n.stop(t + spec.d + 0.02);

  const o = actx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime((far ? 140 : spec.th) * pitchVar, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
  const g2 = actx.createGain();
  g2.gain.setValueAtTime(vol * 0.9, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(g2);
  g2.connect(sGain);
  o.start(t);
  o.stop(t + 0.2);
}

export function tone(freq: number, dur: number, vol: number, type?: OscillatorType, slide?: number) {
  if (!actx || !sGain) return;
  const t = actx.currentTime;
  const o = actx.createOscillator();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(sGain);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function sndStep(run: boolean) {
  if (!actx || !noiseBuf || !sGain) return;
  const t = actx.currentTime;
  const n = actx.createBufferSource();
  n.buffer = noiseBuf;
  const f = actx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = (run ? 700 : 480) * (0.92 + Math.random() * 0.16);
  const g = actx.createGain();
  g.gain.setValueAtTime(run ? 0.16 : 0.1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  n.connect(f);
  f.connect(g);
  g.connect(sGain);
  n.start(t, Math.random() * 0.4);
  n.stop(t + 0.1);
}

export const sndHit = (head: boolean) => tone(head ? 1900 : 1100, 0.07, 0.07, 'square');
export const sndHurt = () => tone(90, 0.25, 0.35, 'sawtooth', 40);
export const sndClick = () => tone(700, 0.04, 0.06, 'square');
export const sndPick = () => {
  tone(520, 0.08, 0.08, 'triangle');
  setTimeout(() => tone(780, 0.1, 0.08, 'triangle'), 70);
};
export const sndKill = () => tone(300, 0.12, 0.09, 'triangle', 120);
export const sndSwap = () => {
  tone(260, 0.05, 0.07, 'square');
  setTimeout(() => tone(420, 0.05, 0.07, 'square'), 90);
};
export const sndLaser = () => tone(1400, 0.5, 0.03, 'sine', 2600);
export const sndVictory = () => {
  tone(440, 0.14, 0.12, 'triangle');
  setTimeout(() => tone(554, 0.14, 0.12, 'triangle'), 110);
  setTimeout(() => tone(659, 0.28, 0.14, 'triangle'), 220);
};
export const sndDefeat = () => {
  tone(260, 0.22, 0.16, 'sawtooth', 160);
  setTimeout(() => tone(160, 0.35, 0.18, 'sawtooth', 85), 180);
};
