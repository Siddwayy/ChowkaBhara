/**
 * Tiny Web Audio sound engine — all SFX are synthesized at runtime, so there
 * are no audio assets to ship. Safe to import on the server (all calls no-op
 * until a browser AudioContext exists and audio has been unlocked by a gesture).
 */

export type SoundName =
  | "tap"
  | "join"
  | "ready"
  | "unready"
  | "start"
  | "roll"
  | "rollLand"
  | "move"
  | "capture"
  | "home"
  | "turn"
  | "victory"
  | "defeat"
  | "tick";

const MUTE_KEY = "chowka_muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

export function unlockAudio(): void {
  const c = getContext();
  if (c && c.state === "suspended") {
    void c.resume().catch(() => {});
  }
}

export function isMuted(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setMuted(muted: boolean): boolean {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  }
  return muted;
}

interface ToneSpec {
  freq: number;
  freqEnd?: number;
  type?: OscillatorType;
  delay?: number;
  duration?: number;
  gain?: number;
}

function playTones(specs: ToneSpec[]): void {
  const c = getContext();
  if (!c || !master) return;
  if (c.state === "suspended") void c.resume().catch(() => {});
  const now = c.currentTime;

  for (const s of specs) {
    const {
      freq,
      freqEnd,
      type = "sine",
      delay = 0,
      duration = 0.15,
      gain = 0.3,
    } = s;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    const start = now + delay;
    const end = start + duration;

    osc.frequency.setValueAtTime(freq, start);
    if (freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), end);
    }

    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.02, duration / 2));
    g.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

const RECIPES: Record<SoundName, () => ToneSpec[]> = {
  tap: () => [{ freq: 660, type: "triangle", duration: 0.06, gain: 0.18 }],
  join: () => [
    { freq: 523, type: "triangle", duration: 0.1, gain: 0.22 },
    { freq: 784, type: "triangle", delay: 0.08, duration: 0.12, gain: 0.22 },
  ],
  ready: () => [
    { freq: 587, type: "square", duration: 0.08, gain: 0.16 },
    { freq: 880, type: "square", delay: 0.07, duration: 0.1, gain: 0.16 },
  ],
  unready: () => [
    { freq: 440, type: "square", duration: 0.08, gain: 0.14 },
    { freq: 330, type: "square", delay: 0.07, duration: 0.1, gain: 0.14 },
  ],
  start: () => [
    { freq: 392, type: "sawtooth", duration: 0.12, gain: 0.22 },
    { freq: 523, type: "sawtooth", delay: 0.1, duration: 0.12, gain: 0.22 },
    { freq: 784, type: "sawtooth", delay: 0.2, duration: 0.18, gain: 0.24 },
  ],
  // Cowrie shells tumbling — dense staggered clicks (~0.55s).
  roll: () => [
    { freq: 280, type: "square", duration: 0.04, gain: 0.11 },
    { freq: 410, type: "square", delay: 0.05, duration: 0.04, gain: 0.12 },
    { freq: 240, type: "square", delay: 0.1, duration: 0.04, gain: 0.1 },
    { freq: 480, type: "triangle", delay: 0.15, duration: 0.05, gain: 0.13 },
    { freq: 320, type: "square", delay: 0.22, duration: 0.04, gain: 0.11 },
    { freq: 520, type: "square", delay: 0.28, duration: 0.04, gain: 0.12 },
    { freq: 260, type: "triangle", delay: 0.34, duration: 0.05, gain: 0.11 },
    { freq: 390, type: "square", delay: 0.4, duration: 0.04, gain: 0.12 },
    { freq: 450, type: "triangle", delay: 0.46, duration: 0.08, gain: 0.14 },
  ],
  // Shells settle / land after the tumble.
  rollLand: () => [
    { freq: 360, type: "triangle", duration: 0.06, gain: 0.16 },
    { freq: 540, type: "triangle", delay: 0.05, duration: 0.1, gain: 0.2 },
  ],
  move: () => [
    { freq: 520, freqEnd: 700, type: "triangle", duration: 0.14, gain: 0.18 },
  ],
  capture: () => [
    { freq: 700, freqEnd: 180, type: "sawtooth", duration: 0.32, gain: 0.28 },
    { freq: 200, type: "square", delay: 0.14, duration: 0.12, gain: 0.2 },
  ],
  home: () => [
    { freq: 523, type: "triangle", duration: 0.1, gain: 0.24 },
    { freq: 659, type: "triangle", delay: 0.09, duration: 0.1, gain: 0.24 },
    { freq: 988, type: "triangle", delay: 0.18, duration: 0.18, gain: 0.26 },
  ],
  turn: () => [
    { freq: 494, type: "triangle", duration: 0.1, gain: 0.18 },
    { freq: 740, type: "triangle", delay: 0.09, duration: 0.12, gain: 0.18 },
  ],
  victory: () => [
    { freq: 523, type: "triangle", duration: 0.14, gain: 0.28 },
    { freq: 659, type: "triangle", delay: 0.12, duration: 0.14, gain: 0.28 },
    { freq: 784, type: "triangle", delay: 0.24, duration: 0.14, gain: 0.28 },
    { freq: 1047, type: "triangle", delay: 0.36, duration: 0.3, gain: 0.3 },
    { freq: 1319, type: "triangle", delay: 0.5, duration: 0.34, gain: 0.3 },
  ],
  defeat: () => [
    { freq: 440, type: "sawtooth", duration: 0.18, gain: 0.24 },
    { freq: 349, type: "sawtooth", delay: 0.16, duration: 0.18, gain: 0.24 },
    { freq: 262, type: "sawtooth", delay: 0.32, duration: 0.4, gain: 0.26 },
  ],
  tick: () => [{ freq: 880, type: "square", duration: 0.04, gain: 0.1 }],
};

export function playSound(name: SoundName): void {
  if (isMuted()) return;
  const recipe = RECIPES[name];
  if (!recipe) return;
  try {
    playTones(recipe());
  } catch {
    /* audio unavailable — ignore */
  }
}
