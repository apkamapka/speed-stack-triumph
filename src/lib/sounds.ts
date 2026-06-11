// Synthesized sound effects (Web Audio API). No audio files, no licensing —
// every sound is generated from oscillators/noise at play time.
// SSR-safe: nothing touches window/AudioContext at import time.

const MUTE_KEY = "tetspeed.muted";

let ctx: AudioContext | null = null;
let muted: boolean | null = null; // lazy-loaded from localStorage

function loadMuted(): boolean {
  if (muted !== null) return muted;
  if (typeof window === "undefined") return true;
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
  return muted;
}

export function isMuted(): boolean {
  return loadMuted();
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    window.localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    // ignore
  }
}

// Must be called from a user gesture (tap/click/keydown) at least once —
// mobile browsers refuse to start audio outside a gesture.
export function unlockAudio() {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
}

function ac(): AudioContext | null {
  if (loadMuted()) return null;
  if (!ctx || ctx.state !== "running") return null;
  return ctx;
}

type ToneOpts = {
  freq: number;
  endFreq?: number; // pitch slide target
  type?: OscillatorType;
  duration?: number; // seconds
  volume?: number; // 0..1
  delay?: number; // seconds from now
};

function tone({ freq, endFreq, type = "square", duration = 0.08, volume = 0.18, delay = 0 }: ToneOpts) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// Short filtered noise burst — used for the hard-drop thud.
function thud(duration = 0.09, volume = 0.3) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime;
  const len = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(420, t0);
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  // horizontal move: barely-there tick (played hundreds of times)
  move() {
    tone({ freq: 520, type: "square", duration: 0.025, volume: 0.05 });
  },
  rotate() {
    tone({ freq: 660, endFreq: 880, type: "square", duration: 0.05, volume: 0.08 });
  },
  hardDrop() {
    thud(0.09, 0.32);
  },
  lock() {
    tone({ freq: 240, type: "triangle", duration: 0.06, volume: 0.14 });
  },
  // pitch rises with round speed — clears feel "hotter" late game
  clear(lines: number, speed: number) {
    const base = 420 + Math.min(20, speed) * 18;
    if (lines >= 4) {
      // tetris: quick ascending arpeggio
      [0, 1, 2, 3].forEach((i) =>
        tone({ freq: base * Math.pow(1.26, i), type: "square", duration: 0.12, volume: 0.2, delay: i * 0.07 }),
      );
    } else {
      for (let i = 0; i < lines; i++) {
        tone({ freq: base * (1 + i * 0.25), endFreq: base * (1.5 + i * 0.25), type: "square", duration: 0.1, volume: 0.16, delay: i * 0.05 });
      }
    }
  },
  // multiplier activation: rising power-up sweep
  power() {
    tone({ freq: 220, endFreq: 1320, type: "sawtooth", duration: 0.3, volume: 0.16 });
    tone({ freq: 440, endFreq: 1760, type: "square", duration: 0.25, volume: 0.1, delay: 0.05 });
  },
  // last seconds of an active multiplier
  multTick() {
    tone({ freq: 1100, type: "square", duration: 0.04, volume: 0.1 });
  },
  // 3-2-1-GO: n = 3,2,1 beeps; n = 0 is the "GO" note
  countdown(n: number) {
    if (n > 0) tone({ freq: 440, type: "square", duration: 0.1, volume: 0.16 });
    else tone({ freq: 880, endFreq: 1175, type: "square", duration: 0.22, volume: 0.2 });
  },
  roundEnd() {
    tone({ freq: 523, type: "square", duration: 0.12, volume: 0.16 });
    tone({ freq: 659, type: "square", duration: 0.12, volume: 0.16, delay: 0.12 });
    tone({ freq: 784, type: "square", duration: 0.2, volume: 0.16, delay: 0.24 });
  },
  gameOver() {
    tone({ freq: 392, endFreq: 98, type: "sawtooth", duration: 0.7, volume: 0.18 });
  },
  // qualified for the global top 100
  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, type: "square", duration: 0.16, volume: 0.18, delay: i * 0.11 }),
    );
    tone({ freq: 1047, type: "square", duration: 0.4, volume: 0.16, delay: 0.44 });
  },
};
