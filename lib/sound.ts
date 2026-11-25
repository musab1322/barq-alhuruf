"use client";
// أصوات خفيفة بدون ملفات (Web Audio)
let ctx: AudioContext | null = null;
function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}
function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.15) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = c.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}
export const sounds = {
  unlock() { ac(); },
  tick() { tone(880, 0, 0.08, "square", 0.05); },
  start() { [523, 659, 784].forEach((f, i) => tone(f, i * 0.1, 0.25, "triangle")); },
  finish() { tone(660, 0, 0.15, "sine"); tone(990, 0.12, 0.25, "sine"); },
  error() { tone(220, 0, 0.25, "sawtooth", 0.08); },
  timeUp() { [440, 349, 262].forEach((f, i) => tone(f, i * 0.18, 0.35, "triangle", 0.18)); },
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.3, "triangle", 0.18)); },
};
