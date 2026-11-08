// The sand of the login page's logo (SandLogo): where each grain lives, and
// where it is at a given moment. The GPU moves every grain with the vertex
// shader of sandShaders.ts; `grainAt` below is the same motion in plain
// TypeScript, run only for the few grains the trackers ride. The two must
// stay in step: a change to one is a change to the other.
//
// Lengths are in "logo units": the logo spans -1 to 1 across, y points up.

// One float per line of the interleaved buffer the GPU reads, per grain
export const FLOATS_PER_GRAIN = 9; // home x y, seeds r1 r2 r3 r4, start x y (in [-1, 1]), tone
export const KICKS = 3;
// The pointer's wake: a mark every BRUSH_EVERY seconds, each pushing for
// BRUSH_LIFE seconds; there are enough of them that a mark has stopped
// pushing before it is reused (a mark reused while it pushed would let its
// sand snap back)
export const BRUSHES = 32;
export const BRUSH_EVERY = 0.03;
export const BRUSH_LIFE = 0.95;

// The motion's numbers, written once and spliced into the shader
export const MOTION = {
  breath: 0.007, // the whole logo swells and settles by this much
  breathPeriod: 7.5, // seconds per breath
  sway: 0.003, // a slow swell runs through the sand at rest
  stir: 0.004, // and each grain wanders a little on its own
  driftEdge: 0.75, // how far past the line the sand is fully on the wind
  windReach: 1.05, // how far the wind carries a grain, at most about 1.2 of this
  introDur: 1.3, // how long one grain takes to come home
  introSpread: 0.9, // the left of the logo gathers first, the right this much later
  kickRadius2: 0.09, // a click throws the sand within about 0.3
  brushRadius2: 0.016, // the pointer pushes the sand within about 0.13
} as const;

// How far a resting grain can be from its home (the tests' bound)
export const REST_REACH = MOTION.breath * 1.1 + (MOTION.sway + MOTION.stir) * Math.SQRT2;

// A float as GLSL wants it (always with a point)
export const glsl = (x: number) => (Number.isInteger(x) ? `${x}.0` : `${x}`);

// ─── Building the field ─────────────────────────────────────────────────

// Small seeded generator (mulberry32): the same sand at every visit
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SandField {
  count: number;
  data: Float32Array; // FLOATS_PER_GRAIN per grain
  aspect: number; // the logo's height over its width
}

// An alpha mask of the logo (cropped to its ink, `width` x `height`):
// `count` grains dropped where it is inked.
export function buildField(alpha: Uint8ClampedArray, width: number, height: number, count: number, seed = 2026): SandField {
  const rand = seeded(seed);
  const aspect = height / width;
  const data = new Float32Array(count * FLOATS_PER_GRAIN);
  let placed = 0;
  // A logo covers well over a tenth of its box: the cap only guards an empty mask
  for (let tries = 0; placed < count && tries < count * 40; tries++) {
    const x = rand() * width;
    const y = rand() * height;
    if (alpha[Math.floor(y) * width + Math.floor(x)] < 128) continue;
    const hx = (x / width) * 2 - 1;
    const hy = (1 - (y / height) * 2) * aspect;
    // Patches of lighter and darker sand, then each grain its own shade
    const patch = Math.sin(hx * 6.1 + Math.sin(hy * 9.3) * 1.7) * Math.sin(hy * 14.2 - hx * 2.3);
    const tone = Math.min(1.15, Math.max(0.55, 0.9 + 0.16 * patch + 0.34 * (rand() - 0.5)));
    data.set([hx, hy, rand(), rand(), rand(), rand(), rand() * 2 - 1, rand() * 2 - 1, tone], placed * FLOATS_PER_GRAIN);
    placed++;
  }
  return { count: placed, data: placed < count ? data.slice(0, placed * FLOATS_PER_GRAIN) : data, aspect };
}

// The grains the trackers ride: spread over the logo, no two closer than
// `gap`. Seeded, so the mesh has the same shape at every visit.
export function pickTrackers(field: SandField, wanted: number, gap: number, seed = 7): number[] {
  const rand = seeded(seed);
  const picked: number[] = [];
  for (let tries = 0; picked.length < wanted && tries < wanted * 400; tries++) {
    const i = Math.floor(rand() * field.count);
    const hx = field.data[i * FLOATS_PER_GRAIN];
    const hy = field.data[i * FLOATS_PER_GRAIN + 1];
    const clear = picked.every((j) => Math.hypot(field.data[j * FLOATS_PER_GRAIN] - hx, field.data[j * FLOATS_PER_GRAIN + 1] - hy) >= gap);
    if (clear) picked.push(i);
  }
  return picked;
}

// ─── One moment ─────────────────────────────────────────────────────────

export interface SandFrame {
  time: number; // seconds
  intro: number; // seconds since the sand started gathering
  drift: number; // 0 to 1: the wind rises once the logo has gathered
  line: [number, number, number, number]; // a point of the drift line, and its normal toward the side that blows away
  wind: [number, number]; // which way the sand goes (unit length)
  extent: [number, number]; // half the stage, in logo units: where the scattered sand starts from
  kicks: Float32Array; // KICKS x (x, y, time, strength): a click throws the sand
  brush: Float32Array; // BRUSHES x (x, y, push x, push y): the pointer's wake, already weighed by age
}

// The drift line wanders slowly across the right half of the logo and
// leans a little; the wind blows to the right, rising and falling.
export function driftAt(t: number): Pick<SandFrame, "line" | "wind"> {
  const lx = 0.3 + 0.35 * Math.sin((2 * Math.PI * t) / 42 + 0.4);
  const lean = 0.2 * Math.sin((2 * Math.PI * t) / 57 + 1);
  const wy = 0.15 + 0.12 * Math.sin((2 * Math.PI * t) / 23);
  const wl = Math.hypot(1, wy);
  return { line: [lx, 0, Math.cos(lean), Math.sin(lean)], wind: [1 / wl, wy / wl] };
}

// How hard a mark of the pointer's wake pushes, by its age: nothing at first,
// most after a tenth of a second, then less and less, and nothing at
// BRUSH_LIFE. The sand gives way softly and settles back slowly.
export function brushWeight(age: number): number {
  if (age <= 0 || age >= BRUSH_LIFE) return 0;
  const rise = 0.12;
  return (age / rise) * Math.exp(1 - age / rise) * (1 - smoothstep(0.65, BRUSH_LIFE, age));
}

// What share of the logo, across, lies past the drift line (the DÉRIVE readout)
export const driftShare = (line: SandFrame["line"]) => Math.round(((1 - line[0]) / 2) * 100);

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const fract = (x: number) => x - Math.floor(x);

// Same as flow() in the shader: a slowly moving field of air
function flow(qx: number, qy: number, t: number): [number, number] {
  return [
    0.5 * (Math.sin(qy * 2.1 + t) + Math.sin(qx * 1.3 - t * 0.6 + qy * 0.7)),
    0.5 * (Math.cos(qx * 1.9 - t * 0.8) + Math.sin(qy * 2.7 + t * 0.5 + qx)),
  ];
}

export interface GrainState {
  x: number;
  y: number;
  alpha: number; // 0 while it has blown away
  gone: number; // 0 at home, 1 at the end of its flight
}

// Where grain `i` is at this frame: the shader's main(), step by step
export function grainAt(field: SandField, i: number, f: SandFrame): GrainState {
  const d = field.data;
  const o = i * FLOATS_PER_GRAIN;
  const [hx, hy, r1, r2, r3, r4, sx, sy] = [d[o], d[o + 1], d[o + 2], d[o + 3], d[o + 4], d[o + 5], d[o + 6], d[o + 7]];
  const t = f.time;

  // At rest the sand breathes, a slow swell runs through it, and each grain
  // wanders a little on its own
  const breath = 1 + MOTION.breath * Math.sin((2 * Math.PI * t) / MOTION.breathPeriod);
  const [w0, w1] = flow(hx * 1.5, hy * 1.5, t * 0.25);
  const [s0, s1] = flow(hx * 2 + r2 * 3, hy * 2 + r2 * 3, t * 0.3 + r1 * 6);
  let x = hx * breath + w0 * MOTION.sway + s0 * MOTION.stir;
  let y = hy * breath + w1 * MOTION.sway + s1 * MOTION.stir;

  // Past the line it blows away, and forms at home again. The edge wavers
  // along the line, and each grain feels it a little early or late.
  const [lx, ly, nx, ny] = f.line;
  const along = (hx - lx) * -ny + (hy - ly) * nx;
  const ragged = 0.06 * Math.sin(along * 9 + t * 0.21) + 0.03 * Math.sin(along * 23 - t * 0.13) + (r4 - 0.5) * 0.16;
  const away = smoothstep(0, MOTION.driftEdge, (hx - lx) * nx + (hy - ly) * ny + ragged) * f.drift;
  let alpha = 1;
  let gone = 0;
  if (away > 0) {
    const phase = fract(t / (3 + 4.5 * r1) + r2);
    const hold = 0.85 + (0.08 - 0.85) * away; // near the line it mostly stays, far past it it mostly flies
    gone = Math.max(0, (phase - hold) / (1 - hold));
    const travel = gone * Math.sqrt(gone);
    const reach = MOTION.windReach * away * (0.5 + 0.9 * r3);
    const [b0, b1] = flow(hx * 2.5 + r4 * 7, hy * 2.5 + r1 * 5, t * 0.3 + phase * 1.5);
    // It lifts (now and then sinks) as it goes, so its path curves
    const curl = reach * travel * travel * (r4 - 0.35) * 0.5;
    x += f.wind[0] * reach * travel + b0 * reach * travel * 0.45 - f.wind[1] * curl;
    y += f.wind[1] * reach * travel + b1 * reach * travel * 0.45 + f.wind[0] * curl;
    const life = smoothstep(0, 0.06, phase) * (1 - smoothstep(0.25, 1, gone));
    alpha = 1 + (life - 1) * smoothstep(0, 0.25, away);
  }

  // Gathering: from dust all over the stage, the left of the logo first
  const g = Math.min(1, Math.max(0, (f.intro - ((hx * 0.5 + 0.5) * MOTION.introSpread + r3 * 0.5)) / MOTION.introDur));
  if (g < 1) {
    const e = g * g * g * (g * (g * 6 - 15) + 10);
    const fx = sx * f.extent[0];
    const fy = sy * f.extent[1];
    const bend = (r2 - 0.5) * 0.35 * Math.sin(Math.PI * e);
    const [dx, dy] = [x - fx, y - fy];
    x = fx + dx * e - dy * bend;
    y = fy + dy * e + dx * bend;
    alpha *= 0.35 + 0.65 * e;
  }

  // A click throws the sand out from where it landed, and it settles back.
  // Each grain's way turns to one side as it goes: out on one line, home on
  // another, so the splash blooms and swirls instead of pulsing.
  for (let k = 0; k < KICKS; k++) {
    const [kx, ky, kt, ks] = [f.kicks[k * 4], f.kicks[k * 4 + 1], f.kicks[k * 4 + 2], f.kicks[k * 4 + 3]];
    const age = t - kt;
    if (ks <= 0 || age < 0 || age > 6) continue;
    const dx = x - kx + (r2 - 0.5) * 0.1;
    const dy = y - ky + (r4 - 0.5) * 0.1;
    const len = Math.hypot(dx, dy) || 1;
    const rise = 0.3 + 0.3 * r1;
    const throwIt = (age / rise) * Math.exp(1 - age / rise) * Math.exp(-(dx * dx + dy * dy) / MOTION.kickRadius2) * ks * (0.2 + 1.4 * r3 * r3 * r3); // most grains go a little way, a few go far
    const turn = (r2 - 0.5) * 1.4 * (1 - Math.exp(-age / rise));
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    const [ux, uy] = [dx / len, dy / len];
    const [a0, a1] = flow(hx * 4 + r4 * 5, hy * 4 + r3 * 5, t * 0.8);
    x += (ux * c - uy * s) * throwIt + a0 * throwIt * 0.25;
    y += (ux * s + uy * c) * throwIt + a1 * throwIt * 0.25;
  }

  // The pointer's wake: the sand moves along with it and parts to both sides
  // of its path, like water round a hand
  for (let b = 0; b < BRUSHES; b++) {
    const [vx, vy] = [f.brush[b * 4 + 2], f.brush[b * 4 + 3]];
    if (vx === 0 && vy === 0) continue;
    const dx = x - f.brush[b * 4];
    const dy = y - f.brush[b * 4 + 1];
    const along = (dx * vx + dy * vy) / (vx * vx + vy * vy);
    const [sx2, sy2] = [dx - along * vx, dy - along * vy];
    const side = Math.hypot(sx2, sy2);
    const [ox, oy] = side > 1e-5 ? [sx2 / side, sy2 / side] : [0, 0];
    const speed = Math.hypot(vx, vy) * (0.4 + 0.8 * r2);
    const w = Math.exp(-(dx * dx + dy * dy) / MOTION.brushRadius2) * (0.5 + r1);
    x += (vx + ox * speed) * w;
    y += (vy + oy * speed) * w;
  }

  return { x, y, alpha, gone };
}
