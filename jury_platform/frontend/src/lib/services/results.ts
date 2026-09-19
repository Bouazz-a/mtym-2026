import type { Criterion, OralEvaluation, PassageDetails, PoolDetails, ReportEvaluation } from "@/types";
import { oralCriteria, reportCriteria, weightedNote } from "./gradingService";

// Per-passage results: each graded team's note from every juror of the
// duo, and their average. Shared by the Notes page and the xlsx export.

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
