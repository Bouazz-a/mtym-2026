import type { AdmissibleList, PoolDetails, Team } from "@/types";
import { FINAL_PART_LABELS, FINAL_PARTS, percent, teamResults, type FinalPart, type NoteSet, type OutsideList, type PassageResult } from "./results";
import { ranking } from "./stats";

// Phase A of the selection (page Admissibles). Every team that played is
// ranked on its admissibility note: the final grade's weighted average
// (Critères page, 9, 3, 2 and 5 by default) where the written part is only
// the report graded at the oral, the one of the problem it defends. The
// first λ × n are admissible: only their other reports are then corrected,
// and they are ranked again on the extended note, the final grade with all
// their reports. The other teams' reports, the defended one aside, count 0.
// A team that never submitted the report of the problem it defends has 0 for
// it, as in the written note (results.ts).

export interface AdmissibilityRow {
  teamId: string;
  pool: PoolDetails;
  problem: number | null; // the problem it defends
  notes: Record<FinalPart, number | null>; // % of the grid; `report` is the defended report
  note: number | null; // the admissibility note, %; null while a weighted part is missing
  rank: number | null; // 1 is the best, equal notes share their place
  missing: FinalPart[]; // the weighted parts still without a note
}

// The admissibility note of every team that played, ranked
export function admissibilityRows(
  results: PassageResult[],
  weights: Record<FinalPart, number>,
  teams: Pick<Team, "id" | "reports">[],
): AdmissibilityRow[] {
  // The defended report stands for the written part: the final grade does the rest
  const submitted = new Map(teams.map((t) => [t.id, new Set(t.reports.map((r) => r.problemNumber))]));
  const defended = new Map<string, NoteSet>();
  const problem = new Map<string, number>();
  for (const r of results) {
    const team = r.passage.defenderTeamId;
    const none = submitted.has(team) && !submitted.get(team)!.has(r.passage.problemNumber);
    defended.set(team, none ? { ...r.report, average: 0 } : r.report);
    problem.set(team, r.passage.problemNumber);
  }
  const rows: AdmissibilityRow[] = teamResults(results, weights, defended).map((t) => ({
    teamId: t.teamId,
    pool: t.pool,
    problem: problem.get(t.teamId) ?? null,
    notes: Object.fromEntries(FINAL_PARTS.map((part) => [part, percent(t.notes[part])])) as Record<FinalPart, number | null>,
    note: t.final,
    rank: null,
    missing: FINAL_PARTS.filter((part) => weights[part] > 0 && percent(t.notes[part]) === null),
  }));
  const ranked = rows.filter((r) => r.note !== null);
  ranking(ranked.map((r) => r.note!)).forEach((place, i) => {
    ranked[i].rank = place;
  });
  return rows;
}

// The most λ can be: the teams that played over n, so that λ × n never asks
// for more teams than there are (134 teams and n = 35 make 3,83). The
// server checks the same (backend routes/admissibles.ts).
export const lambdaMax = (teams: number, places: number) => teams / places;

export interface Selection {
  places: number; // n
  lambda: number; // λ
  lambdaMax: number | null; // null while n isn't a whole number
  error: "places" | "lambda" | null; // the field typed wrong, if any
}

// n and λ as typed: n a whole number, λ above 0 and at most λ max (worked
// out from the teams that played), with a decimal comma or point
export function parseSelection(placesText: string, lambdaText: string, teams: number): Selection {
  const places = Number(placesText.trim());
  const lambda = Number(lambdaText.trim().replace(",", "."));
  if (!Number.isInteger(places) || places < 1 || places > teams) return { places, lambda, lambdaMax: null, error: "places" };
  const max = lambdaMax(teams, places);
  const error = !Number.isFinite(lambda) || lambda <= 0 || lambda > max + 1e-9 ? "lambda" : null;
  return { places, lambda, lambdaMax: max, error };
}

// What a team still misses, in words: "rapport défendu, opposition"
export const missingText = (parts: FinalPart[]) =>
  parts.map((p) => (p === "report" ? "rapport défendu" : FINAL_PART_LABELS[p].toLowerCase())).join(", ");

// How many teams λ × n makes: the whole teams under it (52,5 makes 52)
export const admissibleCount = (places: number, lambda: number) => Math.max(0, Math.floor(places * lambda + 1e-9));

// The first `count` of the ranking. Teams sharing the last place all go in,
// so the list can hold a few more.
export function cut(rows: AdmissibilityRow[], count: number): Set<string> {
  return new Set(rows.filter((r) => r.rank !== null && r.rank <= count).map((r) => r.teamId));
}

// The rows in the order of the ranking, the teams without a note at the end
export function inRankOrder<T extends { rank: number | null }>(rows: T[], tie: (a: T, b: T) => number): T[] {
  return [...rows].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || tie(a, b));
}

// The fixed list as the written notes need it (results.ts): who is in, and
// the problem each team defends, whose report keeps its note
export function outsideList(list: AdmissibleList | null | undefined, pools: PoolDetails[]): OutsideList | undefined {
  if (!list) return undefined;
  return { admissible: new Set(list.teamIds), defended: defendedProblems(pools) };
}

// The problem each team defends (« rapport défendu seulement », and the list above)
export function defendedProblems(pools: PoolDetails[]): Map<string, number> {
  const defended = new Map<string, number>();
  for (const pool of pools) for (const p of pool.passages) defended.set(p.defenderTeamId, p.problemNumber);
  return defended;
}

// What changed since the list was fixed: the teams the ranking as it stands
// would let in, and those it would leave out
export function drift(fixed: string[], now: Set<string>): { enter: string[]; leave: string[] } {
  const was = new Set(fixed);
  return { enter: [...now].filter((id) => !was.has(id)), leave: fixed.filter((id) => !now.has(id)) };
}
