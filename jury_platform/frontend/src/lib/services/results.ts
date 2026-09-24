import type { Center, Criterion, FinalWeights, OralEvaluation, PassageDetails, PoolDetails, ReportEvaluation, Team } from "@/types";
import { CENTERS, QUALIFS_PROBLEMS } from "@/utils/labels";
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
  max: number; // the grid's maximum: Σ positive coefficients (orals), 20 (written reports)
  notes: JurorNote[];
  average: number | null; // null until someone graded
}

export interface PassageResult {
  pool: PoolDetails;
  passage: PassageDetails;
  oral: Record<GradedRole, NoteSet>;
  report: NoteSet; // the defender's report, for the defended problem (out of 20)
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
      const reportSet = outOf20(noteSet(
        passage.defenderTeamId,
        reportCriteria(criteria, passage.problemNumber),
        report.filter((e) => e.teamId === passage.defenderTeamId && e.problemNumber === passage.problemNumber),
      ));
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

// Until the admin changes them (Critères page)
export const DEFAULT_WEIGHTS: FinalWeights = {
  defender: 9,
  opponent: 3,
  reporter: 2,
  report: 5,
  problemWeights: { 1: 25, 2: 25, 3: 25, 4: 25 },
};

// A note as a percentage of its grid's maximum
export function percent(set: NoteSet | null): number | null {
  return set && set.average !== null && set.max > 0 ? (set.average / set.max) * 100 : null;
}

// Σ weight × note% / Σ weights. A part weighted 0 doesn't count, even when
// it's missing; any other missing note leaves the grade pending (null).
export function finalGrade(notes: Record<FinalPart, NoteSet | null>, weights: Record<FinalPart, number>): number | null {
  const parts = FINAL_PARTS.filter((k) => weights[k] > 0).map((k) => ({ weight: weights[k], value: percent(notes[k]) }));
  const total = parts.reduce((s, p) => s + p.weight, 0);
  if (total === 0 || parts.some((p) => p.value === null)) return null;
  return parts.reduce((s, p) => s + p.weight * p.value!, 0) / total;
}

// A written report's note is out of 20, whatever its grid's coefficients add
// up to: the same note set, rescaled.
export function outOf20(set: NoteSet): NoteSet {
  if (set.max <= 0) return set;
  const k = 20 / set.max;
  return {
    ...set,
    max: 20,
    notes: set.notes.map((n) => ({ ...n, total: n.total * k })),
    average: set.average === null ? null : set.average * k,
  };
}

// A team's written-report note, out of 20: the weighted average (weights
// per problem, set on the Critères page) of all its reports — the one of the
// problem it defends (graded by its passage's duo) and the others (each
// corrected by the juror it was handed to). A report's note is the average
// of its jurors'.
//   · it counts as soon as one report is graded, and moves as the others
//     come in (`graded`/`submitted` tell how far along it is);
//   · a problem the team submitted no report for counts 0/20 (`missing`);
//   · a problem whose grid is still empty can't be graded and is left out.
// A team that submitted nothing gets 0 at once.
export interface WrittenNote extends NoteSet {
  graded: number; // submitted reports with a note
  submitted: number; // reports the team submitted (on problems with a grid)
  missing: number[]; // problems without a report, counted 0/20
}

export function writtenReportNotes(
  teams: Team[],
  criteria: Criterion[],
  report: ReportEvaluation[],
  problemWeights: Record<string, number>,
): Map<string, WrittenNote> {
  return new Map(
    teams.map((team) => {
      let sum = 0;
      let weight = 0;
      let graded = 0;
      let submitted = 0;
      const missing: number[] = [];
      const notes: JurorNote[] = [];
      for (const problem of QUALIFS_PROBLEMS) {
        const w = problemWeights[String(problem)] ?? 0;
        const grid = reportCriteria(criteria, problem);
        if (w <= 0 || weightedNote([], grid).maxTotal <= 0) continue;
        if (!team.reports.some((r) => r.problemNumber === problem)) {
          missing.push(problem);
          weight += w; // 0/20
          continue;
        }
        submitted++;
        const set = outOf20(noteSet(team.id, grid, report.filter((e) => e.teamId === team.id && e.problemNumber === problem)));
        if (set.average === null) continue; // not graded yet
        graded++;
        sum += w * set.average;
        weight += w;
        notes.push(...set.notes);
      }
      const counts = weight > 0 && (graded > 0 || submitted === 0);
      return [team.id, { teamId: team.id, max: 20, notes, average: counts ? sum / weight : null, graded, submitted, missing }];
    }),
  );
}

// Each drawn team's notes as defender, opponent and reporter (from the
// passages where it holds each role) and for its written reports (all of
// them, from writtenReportNotes), with its final grade.
export function teamResults(
  results: PassageResult[],
  weights: Record<FinalPart, number>,
  written: Map<string, NoteSet>,
): TeamResult[] {
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
  }
  for (const team of byTeam.values()) {
    team.notes.report = written.get(team.teamId) ?? null;
    team.final = finalGrade(team.notes, weights);
  }
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
