import type { Criterion, ReportEvaluation, Team } from "@/types";
import { QUALIFS_PROBLEMS } from "@/utils/labels";
import { reportCriteria, weightedNote } from "./gradingService";
import { percent, type FinalPart, type PassageResult } from "./results";
import { summarize, type Summary } from "./stats";

// Problem by problem (Résultats page): how the teams did on each part, in %
// of its grid, and who did best.
//   · the three orals count for the problem of the passage they were given in
//     (the opponent and the reporter are graded on the defender's problem);
//   · the written reports are every team's report on that problem, the
//     defended ones and the others.
// A note is the average of its jurors', as everywhere else.

export interface ProblemEntry {
  teamId: string;
  value: number; // % of the grid
  passage?: string; // the passage's label, for the orals
}

export interface ProblemStat {
  problem: number;
  entries: ProblemEntry[]; // best first
  summary: Summary | null; // null while nothing is graded
}

export function problemStats(
  part: FinalPart,
  results: PassageResult[],
  teams: Pick<Team, "id">[],
  criteria: Criterion[],
  report: ReportEvaluation[],
): ProblemStat[] {
  return QUALIFS_PROBLEMS.map((problem) => {
    const entries = part === "report"
      ? writtenEntries(problem, teams, criteria, report)
      : results.flatMap((r) => {
        const value = r.passage.problemNumber === problem ? percent(r.oral[part]) : null;
        return value === null ? [] : [{ teamId: r.oral[part].teamId, value, passage: r.passage.label }];
      });
    entries.sort((a, b) => b.value - a.value);
    return { problem, entries, summary: summarize(entries.map((e) => e.value)) };
  });
}

// Every team's report on the problem: the average of the jurors who graded it
function writtenEntries(problem: number, teams: Pick<Team, "id">[], criteria: Criterion[], report: ReportEvaluation[]): ProblemEntry[] {
  const grid = reportCriteria(criteria, problem);
  const max = weightedNote([], grid).maxTotal;
  if (max <= 0) return [];
  const known = new Set(teams.map((t) => t.id));
  const byTeam = new Map<string, number[]>();
  for (const e of report) {
    if (e.problemNumber !== problem || !known.has(e.teamId)) continue;
    byTeam.set(e.teamId, [...(byTeam.get(e.teamId) ?? []), (weightedNote(e.grades, grid).total / max) * 100]);
  }
  return [...byTeam].map(([teamId, notes]) => ({ teamId, value: notes.reduce((s, n) => s + n, 0) / notes.length }));
}

// The problem with the highest average on that part, when two at least are graded
export function easiestProblem(stats: ProblemStat[]): ProblemStat | null {
  const graded = stats.filter((s) => s.summary);
  if (graded.length < 2) return null;
  return graded.reduce((best, s) => (s.summary!.mean > best.summary!.mean ? s : best));
}
