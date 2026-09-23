import type { Center, Criterion, FinalWeights, OralEvaluation, PassageDetails, PoolDetails, ReportEvaluation } from "@/types";
import { CENTERS } from "@/utils/labels";
import { oralCriteria, reportCriteria, weightedNote } from "./gradingService";

// Per-passage results: each graded team's note from every juror of the
// duo, and their average (Notes page, xlsx export). Per team: its four
// notes and its final grade (Résultats page, xlsx export).

export const GRADED_ROLES = ["defender", "opponent", "reporter"] as const;
type GradedRole = (typeof GRADED_ROLES)[number];

interface JurorNote {
  juryId: string;
  total: number;
  globalRemark: string | null;
}

export interface NoteSet {
  teamId: string;
  max: number; // Σ positive coefficients of the grid
  notes: JurorNote[];
  average: number | null; // null until someone graded
}

export interface PassageResult {
  pool: PoolDetails;
  passage: PassageDetails;
  oral: Record<GradedRole, NoteSet>;
  report: NoteSet; // the defender's report, for the defended problem
  expected: number; // evaluations the duo owes: 2 jurors × (3 orals + 1 report)
  done: number;
}

function noteSet(
  teamId: string,
  grid: Criterion[],
  evaluations: { juryId: string; grades: { criterionId: string; score: number }[]; globalRemark: string | null }[],
): NoteSet {
  const notes = evaluations.map((e) => ({
    juryId: e.juryId,
    total: weightedNote(e.grades, grid).total,
    globalRemark: e.globalRemark,
  }));
  const max = weightedNote([], grid).maxTotal;
  const average = notes.length ? notes.reduce((s, n) => s + n.total, 0) / notes.length : null;
  return { teamId, max, notes, average };
}

export function passageResults(
  pools: PoolDetails[],
  criteria: Criterion[],
  oral: OralEvaluation[],
  report: ReportEvaluation[],
): PassageResult[] {
  return pools.flatMap((pool) =>
    pool.passages.map((passage) => {
      const oralSets = Object.fromEntries(
        GRADED_ROLES.map((role) => {
          const teamId = passage[`${role}TeamId`];
          const evals = oral.filter((e) => e.passageId === passage.id && e.teamId === teamId);
          return [role, noteSet(teamId, oralCriteria(criteria, role), evals)];
        }),
      ) as Record<GradedRole, NoteSet>;
      const reportSet = noteSet(
        passage.defenderTeamId,
        reportCriteria(criteria, passage.problemNumber),
        report.filter((e) => e.teamId === passage.defenderTeamId && e.problemNumber === passage.problemNumber),
      );
      const done = GRADED_ROLES.reduce((s, r) => s + oralSets[r].notes.length, 0) + reportSet.notes.length;
      const jurors = passage.duo?.members.length ?? 2;
      return { pool, passage, oral: oralSets, report: reportSet, expected: jurors * 4, done };
    }),
  );
}

// ─── Per team: the four notes and the final grade ─────────────────────

export const FINAL_PARTS = ["defender", "opponent", "reporter", "report"] as const;
export type FinalPart = (typeof FINAL_PARTS)[number];

// How the four notes are named on the Critères, Notes and Résultats pages
export const FINAL_PART_LABELS: Record<FinalPart, string> = {
  defender: "Défense",
  opponent: "Opposition",
  reporter: "Rapporteur",
  report: "Rapport écrit",
};

export interface TeamResult {
  teamId: string;
  pool: PoolDetails;
  notes: Record<FinalPart, NoteSet | null>; // null: no passage in that role
  final: number | null; // % — null until every weighted note is in
}

// A note as a percentage of its grid's maximum
export function percent(set: NoteSet | null): number | null {
  return set && set.average !== null && set.max > 0 ? (set.average / set.max) * 100 : null;
}

// Σ weight × note% / Σ weights. A part weighted 0 doesn't count, even when
// it's missing; any other missing note leaves the grade pending (null).
export function finalGrade(notes: Record<FinalPart, NoteSet | null>, weights: FinalWeights): number | null {
  const parts = FINAL_PARTS.filter((k) => weights[k] > 0).map((k) => ({ weight: weights[k], value: percent(notes[k]) }));
  const total = parts.reduce((s, p) => s + p.weight, 0);
  if (total === 0 || parts.some((p) => p.value === null)) return null;
  return parts.reduce((s, p) => s + p.weight * p.value!, 0) / total;
}

// Each drawn team's notes as defender, opponent and reporter (from the
// passages where it holds each role) and for its written report (from the
// passage it defends), with its final grade.
export function teamResults(results: PassageResult[], weights: FinalWeights): TeamResult[] {
  const byTeam = new Map<string, TeamResult>();
  const entry = (teamId: string, pool: PoolDetails) => {
    let team = byTeam.get(teamId);
    if (!team) {
      team = { teamId, pool, notes: { defender: null, opponent: null, reporter: null, report: null }, final: null };
      byTeam.set(teamId, team);
    }
    return team;
  };
  for (const r of results) {
    for (const role of GRADED_ROLES) entry(r.oral[role].teamId, r.pool).notes[role] = r.oral[role];
    entry(r.report.teamId, r.pool).notes.report = r.report;
  }
  for (const team of byTeam.values()) team.final = finalGrade(team.notes, weights);
  return [...byTeam.values()];
}

// ─── Notes and Résultats pages: one center, then one table per day ────

// The centers that have pools, in the usual order
export function centersWithPools(pools: PoolDetails[]) {
  return CENTERS.filter((c) => pools.some((p) => p.centerDay?.center === c.value));
}

// A center's rows grouped by day, in date order
export function daysOfCenter<Row extends { pool: PoolDetails }>(rows: Row[], center: Center | null): [string, Row[]][] {
  const byDay = new Map<string, Row[]>();
  for (const row of rows) {
    const day = row.pool.centerDay;
    if (!day || day.center !== center) continue;
    byDay.set(day.date, [...(byDay.get(day.date) ?? []), row]);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
}
