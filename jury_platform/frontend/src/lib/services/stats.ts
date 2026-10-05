// Descriptive statistics of a list of notes: what the Résultats page charts.
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
