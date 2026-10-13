// Descriptive statistics of a list of notes, and of two notes of the same
// teams (how they go together): what the Résultats page charts.
//
// Variance and standard deviation are the population's (divisor n): the
// teams are the whole population, not a sample of it.

const ascending = (xs: number[]) => [...xs].sort((a, b) => a - b);

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

// The value a share `q` of the notes stay under, interpolated between the
// two nearest ranks (a spreadsheet's QUARTILE.INC)
export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const sorted = ascending(xs);
  const at = (sorted.length - 1) * q;
  const below = Math.floor(at);
  return sorted[below] + (sorted[Math.ceil(at)] - sorted[below]) * (at - below);
}

export const median = (xs: number[]) => quantile(xs, 0.5);

export function variance(xs: number[]): number | null {
  const m = mean(xs);
  return m === null ? null : xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
}

export function stdDev(xs: number[]): number | null {
  const v = variance(xs);
  return v === null ? null : Math.sqrt(v);
}

// Median absolute deviation, Med(|X - Med(X)|): a spread that a few extreme
// notes barely move
export function mad(xs: number[]): number | null {
  const m = median(xs);
  return m === null ? null : median(xs.map((x) => Math.abs(x - m)));
}

export interface Summary {
  count: number;
  mean: number;
  median: number;
  variance: number;
  stdDev: number;
  mad: number;
  min: number;
  q1: number;
  q3: number;
  max: number;
}

// Null when there is nothing to summarize
export function summarize(xs: number[]): Summary | null {
  if (!xs.length) return null;
  return {
    count: xs.length,
    mean: mean(xs)!,
    median: median(xs)!,
    variance: variance(xs)!,
    stdDev: stdDev(xs)!,
    mad: mad(xs)!,
    min: Math.min(...xs),
    q1: quantile(xs, 0.25)!,
    q3: quantile(xs, 0.75)!,
    max: Math.max(...xs),
  };
}

// ─── Two notes of the same teams ─────────────────────────────────────

// One team's two notes, or two ranks: [x, y]
export type Pair = [number, number];

const MIN_PAIRS = 3; // under three teams, two notes "go together" by accident

// Pearson's r, from -1 to 1: how closely y follows x along a straight line.
// Null under three pairs, and when one of the two never varies.
export function pearson(pairs: Pair[]): number | null {
  if (pairs.length < MIN_PAIRS) return null;
  const mx = mean(pairs.map(([x]) => x))!;
  const my = mean(pairs.map(([, y]) => y))!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

// The straight line that best tells y from x (least squares): y = slope · x + intercept
export function linearFit(pairs: Pair[]): { slope: number; intercept: number } | null {
  if (pairs.length < MIN_PAIRS) return null;
  const mx = mean(pairs.map(([x]) => x))!;
  const my = mean(pairs.map(([, y]) => y))!;
  const sxx = pairs.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = pairs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx;
  return { slope, intercept: my - slope * mx };
}

// Two notes this close are the same note: a difference left by the order of an addition
const SAME = 1e-9;

// Each value's place, the highest first, in the order given. Equal values
// share their place and the next one skips as many (1, 2, 2, 4), like a
// sports ranking.
export function ranking(values: number[]): number[] {
  const order = values.map((_, i) => i).sort((a, b) => values[b] - values[a]);
  const out: number[] = new Array(values.length);
  order.forEach((index, place) => {
    const previous = order[place - 1];
    out[index] = place > 0 && Math.abs(values[previous] - values[index]) < SAME ? out[previous] : place + 1;
  });
  return out;
}

// Places for a rank correlation: equal values take the middle of the places they share
function midRanks(values: number[]): number[] {
  const places = ranking(values);
  const shared = new Map<number, number>();
  for (const place of places) shared.set(place, (shared.get(place) ?? 0) + 1);
  return places.map((place) => place + (shared.get(place)! - 1) / 2);
}

// Spearman's rho, from -1 to 1: Pearson's r of the two rankings. It only
// asks whether the teams come in the same order, not by how much.
export function spearman(pairs: Pair[]): number | null {
  if (pairs.length < MIN_PAIRS) return null;
  const rx = midRanks(pairs.map(([x]) => x));
  const ry = midRanks(pairs.map(([, y]) => y));
  return pearson(rx.map((x, i) => [x, ry[i]]));
}

// Of all the ways to pick two teams, the share that both notes put in the
// same order (0 to 1). Two teams level on one of the notes are left out.
// Null when no two teams can be told apart.
export function concordance(pairs: Pair[]): number | null {
  let same = 0;
  let compared = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const dx = pairs[i][0] - pairs[j][0];
      const dy = pairs[i][1] - pairs[j][1];
      if (Math.abs(dx) < SAME || Math.abs(dy) < SAME) continue;
      compared++;
      if (dx > 0 === dy > 0) same++;
    }
  }
  return compared > 0 ? same / compared : null;
}

// How strong a link a correlation tells of, whatever its sign (the usual
// thresholds: 0.1, 0.3, 0.5, 0.7)
export type Strength = "none" | "weak" | "moderate" | "strong" | "veryStrong";

export function strength(r: number): Strength {
  const size = Math.abs(r);
  return size < 0.1 ? "none" : size < 0.3 ? "weak" : size < 0.5 ? "moderate" : size < 0.7 ? "strong" : "veryStrong";
}

// ─── For the charts ───────────────────────────────────────────────────

// A round top for an axis of counts: 7 -> 8, 13 -> 15, 42 -> 50
export function niceMax(n: number): number {
  const step = 10 ** Math.floor(Math.log10(Math.max(1, n)));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * step).find((v) => v >= n) ?? n;
}

// Round bounds around the notes, at least one `step` apart: the scale of a chart
export function niceDomain(xs: number[], step = 10): [number, number] {
  if (!xs.length) return [0, step];
  const from = Math.floor(Math.min(...xs) / step) * step;
  return [from, Math.max(from + step, Math.ceil(Math.max(...xs) / step) * step)];
}

export interface Bin<T> {
  from: number;
  to: number; // excluded, except in the last bin
  items: T[];
}

// The items sorted into classes `step` wide, from the lowest to the highest
// (empty classes in between included)
export function bins<T>(items: T[], value: (item: T) => number, step: number): Bin<T>[] {
  if (!items.length) return [];
  const [from, to] = niceDomain(items.map(value), step);
  const count = Math.round((to - from) / step);
  const out: Bin<T>[] = Array.from({ length: count }, (_, i) => ({ from: from + i * step, to: from + (i + 1) * step, items: [] }));
  for (const item of items) out[Math.min(count - 1, Math.floor((value(item) - from) / step))].items.push(item);
  return out;
}

// A statistic as read on screen: French decimal comma, one decimal by default
export function frStat(n: number, digits = 1): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
