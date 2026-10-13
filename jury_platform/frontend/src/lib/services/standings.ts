import { FINAL_PARTS, GRADED_ROLES, finalGrade, percent, type FinalPart, type NoteSet, type PassageResult, type TeamResult } from "./results";
import { concordance, mean, median, pearson, ranking, spearman, stdDev, summarize, variance, type Pair, type Summary } from "./stats";

// Oral and written, side by side (Résultats page): each team's note at the
// oral alone, for its written reports alone and for everything, its place in
// each of the three rankings, and how the two halves go together.
//   · the oral alone is the three roles weighted as in the final grade;
//   · the written alone is the written-report note;
//   · everything is the final grade.
// A ranking only holds the teams that have its note: a team still waiting
// for one has no place in it.

// A note a team can be read or ranked on: one of its four, or one of the two
// made of several
export type NoteKey = FinalPart | "oral" | "final";
// The three rankings
export const RANKINGS = ["final", "oral", "report"] as const;
export type RankingKey = (typeof RANKINGS)[number];

export interface Standing {
  teamId: string;
  notes: Record<NoteKey, number | null>; // % of the grid, null until graded
  ranks: Record<RankingKey, number | null>; // 1 is the best, equal notes share their place
  gap: number | null; // its place in writing minus its place at the oral: above 0, it does better at the oral
}

// The three roles weighted as in the final grade, the written report left
// out. Should the three be weighted 0, they count alike: there is still an
// oral to rank.
export function oralGrade(notes: Record<FinalPart, NoteSet | null>, weights: Record<FinalPart, number>): number | null {
  const unweighted = GRADED_ROLES.every((role) => weights[role] <= 0);
  const weight = (role: FinalPart) => (unweighted ? 1 : weights[role]);
  return finalGrade(notes, { defender: weight("defender"), opponent: weight("opponent"), reporter: weight("reporter"), report: 0 });
}

export function standings(rows: TeamResult[], weights: Record<FinalPart, number>): Standing[] {
  const list: Standing[] = rows.map((row) => ({
    teamId: row.teamId,
    notes: {
      defender: percent(row.notes.defender),
      opponent: percent(row.notes.opponent),
      reporter: percent(row.notes.reporter),
      report: percent(row.notes.report),
      oral: oralGrade(row.notes, weights),
      final: row.final,
    },
    ranks: { final: null, oral: null, report: null },
    gap: null,
  }));
  for (const key of RANKINGS) {
    const ranked = list.filter((s) => s.notes[key] !== null);
    ranking(ranked.map((s) => s.notes[key]!)).forEach((place, i) => {
      ranked[i].ranks[key] = place;
    });
  }
  for (const s of list) {
    if (s.ranks.oral !== null && s.ranks.report !== null) s.gap = s.ranks.report - s.ranks.oral;
  }
  return list;
}

// ─── How two notes go together ────────────────────────────────────────

export interface NotePoint {
  teamId: string;
  x: number;
  y: number;
}

// The teams that have both notes, one point each
export function notePoints(list: Standing[], x: NoteKey, y: NoteKey): NotePoint[] {
  return list.flatMap((s) => (s.notes[x] === null || s.notes[y] === null ? [] : [{ teamId: s.teamId, x: s.notes[x], y: s.notes[y] }]));
}

const pairs = (points: NotePoint[]): Pair[] => points.map((p) => [p.x, p.y]);

export const correlation = (points: NotePoint[]) => pearson(pairs(points));

// The oral and the written report, in a few figures
export interface Agreement {
  count: number; // teams with both notes
  pearson: number | null; // do the notes follow each other
  spearman: number | null; // do the rankings
  concordance: number | null; // share of pairs of teams both rank the same way, 0 to 1
  medianGap: number | null; // places a team typically moves between the two rankings
}

export function agreement(list: Standing[]): Agreement {
  const points = notePoints(list, "report", "oral");
  return {
    count: points.length,
    pearson: pearson(pairs(points)),
    spearman: spearman(pairs(points)),
    concordance: concordance(pairs(points)),
    medianGap: median(list.flatMap((s) => (s.gap === null ? [] : [Math.abs(s.gap)]))),
  };
}

// The teams the two rankings disagree most about: those far higher at the
// oral, those far higher in writing, the widest gap first
export function widestGaps(list: Standing[], count: number): { oral: Standing[]; written: Standing[] } {
  const apart = list.filter((s) => s.gap !== null && s.gap !== 0);
  return {
    oral: apart.filter((s) => s.gap! > 0).sort((a, b) => b.gap! - a.gap!).slice(0, count),
    written: apart.filter((s) => s.gap! < 0).sort((a, b) => a.gap! - b.gap!).slice(0, count),
  };
}

// ─── Were one half the only one to count ──────────────────────────────

export interface TopShift {
  top: string[]; // the first `size` teams of the final ranking (more when the last place is shared)
  kept: string[]; // those that would stay among the first
  out: string[]; // those that would leave, the best placed first
  in: string[]; // those that would take their place
}

// The first `size` teams of the final ranking, against the first `size` of
// the oral alone or of the written alone
export function topShift(list: Standing[], size: number, by: "oral" | "report"): TopShift {
  const first = (key: RankingKey) => list
    .filter((s) => s.ranks[key] !== null && s.ranks[key]! <= size)
    .sort((a, b) => a.ranks[key]! - b.ranks[key]!)
    .map((s) => s.teamId);
  const top = first("final");
  const alone = first(by);
  return {
    top,
    kept: top.filter((id) => alone.includes(id)),
    out: top.filter((id) => !alone.includes(id)),
    in: alone.filter((id) => !top.includes(id)),
  };
}

// ─── What each part really weighs ─────────────────────────────────────

export interface PartInfluence {
  part: FinalPart;
  weight: number; // its share of the coefficients, 0 to 1
  share: number | null; // its share of the differences between the teams' final grades; null with too few teams
  spread: number | null; // the standard deviation of its notes, in points
  link: number | null; // its correlation with the final grade
}

// A part weighs its coefficient on paper. In the ranking it weighs what it
// adds to the differences between teams: a part whose notes are spread out,
// and go the way of the others, separates the teams more than its
// coefficient says. Its share is coefficient × covariance(part, final grade),
// over the final grade's variance: the four add up to 1. Said with the two
// figures given along: coefficient × link × spread, over the final grades'
// standard deviation.
export function partInfluence(list: Standing[], weights: Record<FinalPart, number>): PartInfluence[] {
  const total = FINAL_PARTS.reduce((s, part) => s + Math.max(0, weights[part]), 0);
  const graded = list.filter((s) => s.notes.final !== null);
  const finalSpread = variance(graded.map((s) => s.notes.final!));
  return FINAL_PARTS.map((part) => {
    const weight = total > 0 ? Math.max(0, weights[part]) / total : 0;
    if (graded.length < 3 || !finalSpread) return { part, weight, share: null, spread: null, link: null };
    // A part weighted 0 may be missing from a graded team
    const points = graded.flatMap((s): Pair[] => (s.notes[part] === null ? [] : [[s.notes[part], s.notes.final!]]));
    const [partCenter, finalCenter] = [mean(points.map(([note]) => note)), mean(points.map(([, final]) => final))];
    const figures = { spread: stdDev(points.map(([note]) => note)), link: pearson(points) };
    if (weight === 0 || partCenter === null || finalCenter === null) return { part, weight, share: 0, ...figures };
    const covariance = points.reduce((s, [note, final]) => s + (note - partCenter) * (final - finalCenter), 0) / points.length;
    return { part, weight, share: (weight * covariance) / finalSpread, ...figures };
  });
}

// ─── Do the jurors of a duo agree ─────────────────────────────────────

export interface JurorGap {
  key: string;
  teamId: string;
  passage: string; // its label
  jurors: number;
  gap: number; // the highest note minus the lowest, in points of % of the grid
}

export interface PartAgreement {
  part: FinalPart;
  gaps: JurorGap[]; // the widest first
  summary: Summary | null; // null while no performance has two notes
}

// For each performance two jurors or more graded (a role in a passage, the
// report its duo corrects): how far apart their notes are. The written
// reports handed to a single juror have nothing to compare.
export function jurorAgreement(results: PassageResult[]): PartAgreement[] {
  return FINAL_PARTS.map((part) => {
    const gaps = results.flatMap((r): JurorGap[] => {
      const set = part === "report" ? r.report : r.oral[part];
      if (set.notes.length < 2 || set.max <= 0) return [];
      const totals = set.notes.map((n) => n.total);
      return [{
        key: `${r.passage.id}:${part}`,
        teamId: set.teamId,
        passage: r.passage.label,
        jurors: totals.length,
        gap: ((Math.max(...totals) - Math.min(...totals)) / set.max) * 100,
      }];
    });
    gaps.sort((a, b) => b.gap - a.gap);
    return { part, gaps, summary: summarize(gaps.map((g) => g.gap)) };
  });
}
