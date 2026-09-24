// Automatic assignment of reports to jurors: each report of a problem a
// team doesn't defend goes to one juror (the defended report is graded by
// the duo of its passage and never comes here).
//
// Rules, in order of importance:
//
//   1. every juror ends up with the same number of reports, give or take
//      one (reports kept as they are count toward that number);
//   2. a report goes to a specialist of its problem — a juror whose duo has
//      that problem — whenever the loads of rule 1 leave room for it;
//   3. the "+1" of rule 1 goes to the jurors for whom it saves a report
//      from leaving its specialists.
//
// How: the jurors are filled up to a common level L, one slot per report
// still to place. Every slot below L must be filled (that's rule 1), but
// the top layer, the one reaching L, has more slots than reports left for
// it: filler rows, which only fit top slots, take the ones left over. A
// report in a slot of a non-specialist costs a lot, so the cheapest
// matching (minCostAssignment) keeps reports with their specialists as far
// as rule 1 allows, and decides who gets the "+1" (rule 3).
//
// Pure computation: POST /api/report-assignments/auto
// (routes/report-assignments.ts) feeds it the reports and applies the plan.

import { minCostAssignment } from "./hungarian";

export interface AssignReport {
  id: string;
  problemNumber: number;
  accountId: string | null; // current juror
  /** Already graded by its juror: the server refuses to move it */
  locked: boolean;
}

export interface AssignJuror {
  id: string;
  problems: number[]; // problems of the juror's duos
}

export type ReportAssignMode = "fill" | "replace";

export interface ReportAssignmentPlan {
  /** Only what changes, ready for the API */
  changes: { reportId: string; accountId: string | null }[];
  assigned: number; // reports that end up with a juror
  unassigned: number; // left without one (no juror to take them)
  offSpecialty: number; // reports held by a juror who isn't a specialist of their problem
  perJuror: { accountId: string; count: number; offSpecialty: number }[];
}

const NON_SPECIALIST = 1e3; // a report outside its juror's problems
const FORBIDDEN = 1e9; // a filler row in a slot that must hold a report

export function planReportAssignment(
  reports: AssignReport[],
  jurors: AssignJuror[],
  mode: ReportAssignMode,
): ReportAssignmentPlan {
  const problemsOf = new Map(jurors.map((j) => [j.id, new Set(j.problems)]));
  const isSpecialist = (accountId: string, problem: number) => problemsOf.get(accountId)?.has(problem) ?? false;

  // What each report ends up with, starting from what is kept as is
  const keep = (r: AssignReport) => r.locked || (mode === "fill" && r.accountId !== null);
  const chosen = new Map(reports.map((r) => [r.id, keep(r) ? r.accountId : null]));
  const kept = new Map(jurors.map((j) => [j.id, 0]));
  for (const accountId of chosen.values()) {
    if (accountId && kept.has(accountId)) kept.set(accountId, kept.get(accountId)! + 1);
  }

  // Deterministic order: same reports, same jurors, same plan
  const open = reports
    .filter((r) => !keep(r))
    .sort((a, b) => a.problemNumber - b.problemNumber || a.id.localeCompare(b.id));

  if (open.length > 0 && jurors.length > 0) {
    // The lowest level L at which the jurors have room for every open report
    const room = (level: number) => jurors.reduce((s, j) => s + Math.max(0, level - kept.get(j.id)!), 0);
    let level = 0;
    while (room(level) < open.length) level++;

    const slots = jurors.flatMap((j) =>
      Array.from({ length: Math.max(0, level - kept.get(j.id)!) }, (_, i) => ({
        jurorId: j.id,
        top: kept.get(j.id)! + i + 1 === level,
      })),
    );
    const cost = [
      ...open.map((report) => slots.map((slot) => (isSpecialist(slot.jurorId, report.problemNumber) ? 0 : NON_SPECIALIST))),
      ...Array.from({ length: slots.length - open.length }, () => slots.map((slot) => (slot.top ? 0 : FORBIDDEN))),
    ];
    minCostAssignment(cost).forEach((col, row) => {
      if (row < open.length && col >= 0) chosen.set(open[row].id, slots[col].jurorId);
    });
  }

  // Report and diff
  const changes: ReportAssignmentPlan["changes"] = [];
  const perJuror = new Map(jurors.map((j) => [j.id, { accountId: j.id, count: 0, offSpecialty: 0 }]));
  let assigned = 0;
  let offSpecialty = 0;
  for (const report of reports) {
    const accountId = chosen.get(report.id) ?? null;
    if (accountId !== report.accountId) changes.push({ reportId: report.id, accountId });
    if (!accountId) continue;
    assigned++;
    const off = !isSpecialist(accountId, report.problemNumber);
    if (off) offSpecialty++;
    const stats = perJuror.get(accountId);
    if (stats) {
      stats.count++;
      if (off) stats.offSpecialty++;
    }
  }

  return { changes, assigned, unassigned: reports.length - assigned, offSpecialty, perJuror: [...perJuror.values()] };
}
