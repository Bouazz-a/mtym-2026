import type {
  Account, AssignableReport, Center, Criterion, OralEvaluation, PassageDetails, PoolDetails, ReportEvaluation,
} from "@/types";
import { oralCriteria, reportCriteria, weightedNote } from "./gradingService";
import { GRADED_ROLES } from "./results";

// What each juror has to grade and what they did (Notes page, « Par juré »):
// the three orals and the defended report of every passage their duo judges,
// the reports handed to them, and any note of theirs that no longer matches
// either (left over after the pools or the duos changed). Each note comes
// with the other jurors' average on the same thing, to see who grades high
// or low.

type GradedRole = (typeof GRADED_ROLES)[number];

const REPORT_OUT_OF = 20; // a written report reads out of 20, whatever its grid adds up to

interface TaskBase {
  key: string;
  // "passage": owed for a passage their duo judges; "assigned": a report
  // handed to them; "stray": a note they gave that nothing asks for any more
  origin: "passage" | "assigned" | "stray";
  teamId: string;
  total: number | null; // the note, out of `max`; null until graded
  max: number;
  percent: number | null; // the note in % of its grid
  others: number | null; // the other jurors' average on the same thing, in %
  remark: string | null;
  countsZero: boolean; // a report of a team left out of the admissibles: it counts 0 whatever its note
}

export type JurorTask = TaskBase & (
  | { kind: "oral"; role: GradedRole; passage: PassageDetails; pool: PoolDetails; evaluation: OralEvaluation | null }
  | { kind: "report"; problemNumber: number; passage: PassageDetails | null; pool: PoolDetails | null; evaluation: ReportEvaluation | null }
);

export interface Tally {
  done: number;
  expected: number;
}

export interface JurorSheet {
  id: string;
  name: string;
  centers: Center[];
  passages: number; // passages their duo judges
  tasks: JurorTask[]; // in reading order: passage by passage, then the reports handed out, then the strays
  orals: Tally;
  reports: Tally; // defended reports and reports handed out
  all: Tally;
  strays: number;
  meanPercent: number | null; // the average of the notes they gave, in %
  gap: number | null; // their notes minus the other jurors', on average, in points of %
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

function group<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) out.set(key(item), [...(out.get(key(item)) ?? []), item]);
  return out;
}

export function jurorSheets(
  accounts: Pick<Account, "id" | "firstName" | "lastName" | "isJuror">[],
  pools: PoolDetails[],
  criteria: Criterion[],
  oral: OralEvaluation[],
  report: ReportEvaluation[],
  assigned: (Pick<AssignableReport, "teamId" | "problemNumber" | "accountId"> & { admissible?: boolean })[],
): JurorSheet[] {
  const oralGrid = Object.fromEntries(GRADED_ROLES.map((role) => [role, oralCriteria(criteria, role)])) as Record<GradedRole, Criterion[]>;
  const reportGrid = new Map<number, Criterion[]>();
  const gridOfProblem = (problem: number) => {
    if (!reportGrid.has(problem)) reportGrid.set(problem, reportCriteria(criteria, problem));
    return reportGrid.get(problem)!;
  };
  const pct = (grades: { criterionId: string; score: number }[], grid: Criterion[]) => {
    const { total, maxTotal } = weightedNote(grades, grid);
    return maxTotal > 0 ? (total / maxTotal) * 100 : null;
  };

  const oralsOn = group(oral, (e) => `${e.passageId}:${e.teamId}`);
  const reportsOn = group(report, (e) => `${e.teamId}:${e.problemNumber}`);
  const slots = pools
    .flatMap((pool) => pool.passages.map((passage) => ({ pool, passage })))
    .sort((a, b) =>
      (a.pool.centerDay?.date ?? "").localeCompare(b.pool.centerDay?.date ?? "")
      || a.passage.slot - b.passage.slot
      || a.passage.label.localeCompare(b.passage.label, "fr", { numeric: true }));
  const passageById = new Map(slots.map((s) => [s.passage.id, s]));

  const oralTask = (
    jurorId: string, origin: TaskBase["origin"], slot: (typeof slots)[number], role: GradedRole, teamId: string,
  ): JurorTask => {
    const on = oralsOn.get(`${slot.passage.id}:${teamId}`) ?? [];
    const evaluation = on.find((e) => e.juryId === jurorId) ?? null;
    const grid = oralGrid[role];
    const note = evaluation ? weightedNote(evaluation.grades, grid) : null;
    return {
      key: `oral:${slot.passage.id}:${teamId}`,
      kind: "oral", origin, role, teamId, ...slot, evaluation,
      total: note ? note.total : null,
      max: weightedNote([], grid).maxTotal,
      percent: evaluation ? pct(evaluation.grades, grid) : null,
      others: mean(on.filter((e) => e.juryId !== jurorId).flatMap((e) => pct(e.grades, grid) ?? [])),
      remark: evaluation?.globalRemark ?? null,
      countsZero: false,
    };
  };

  const reportTask = (
    jurorId: string, origin: TaskBase["origin"], teamId: string, problemNumber: number, slot: (typeof slots)[number] | null,
    countsZero = false,
  ): JurorTask => {
    const on = reportsOn.get(`${teamId}:${problemNumber}`) ?? [];
    const evaluation = on.find((e) => e.juryId === jurorId) ?? null;
    const grid = gridOfProblem(problemNumber);
    const percent = evaluation ? pct(evaluation.grades, grid) : null;
    return {
      key: `report:${teamId}:${problemNumber}`,
      kind: "report", origin, teamId, problemNumber, passage: slot?.passage ?? null, pool: slot?.pool ?? null, evaluation,
      total: percent === null ? null : (percent / 100) * REPORT_OUT_OF,
      max: REPORT_OUT_OF,
      percent,
      others: mean(on.filter((e) => e.juryId !== jurorId).flatMap((e) => pct(e.grades, grid) ?? [])),
      remark: evaluation?.globalRemark ?? null,
      countsZero,
    };
  };

  return accounts
    .filter((a) => a.isJuror)
    .map((account) => {
      const judged = slots.filter((s) => s.passage.duo?.members.some((m) => m.id === account.id));
      const tasks: JurorTask[] = judged.flatMap((slot) => [
        ...GRADED_ROLES.map((role) => oralTask(account.id, "passage", slot, role, slot.passage[`${role}TeamId`])),
        reportTask(account.id, "passage", slot.passage.defenderTeamId, slot.passage.problemNumber, slot),
      ]);
      const seen = new Set(tasks.map((t) => t.key));
      const add = (task: JurorTask) => {
        if (seen.has(task.key)) return;
        seen.add(task.key);
        tasks.push(task);
      };
      for (const r of assigned) {
        if (r.accountId === account.id) add(reportTask(account.id, "assigned", r.teamId, r.problemNumber, null, r.admissible === false));
      }
      // Whatever else they graded: nothing asks for it any more
      for (const e of oral) {
        const slot = e.juryId === account.id ? passageById.get(e.passageId) : undefined;
        const role = slot && GRADED_ROLES.find((r) => slot.passage[`${r}TeamId`] === e.teamId);
        if (slot && role) add(oralTask(account.id, "stray", slot, role, e.teamId));
      }
      for (const e of report) if (e.juryId === account.id) add(reportTask(account.id, "stray", e.teamId, e.problemNumber, null));

      const owed = tasks.filter((t) => t.origin !== "stray");
      const tally = (list: JurorTask[]): Tally => ({ done: list.filter((t) => t.evaluation).length, expected: list.length });
      const graded = tasks.filter((t) => t.percent !== null);
      return {
        id: account.id,
        name: `${account.firstName} ${account.lastName}`,
        centers: [...new Set(judged.flatMap((s) => s.pool.centerDay?.center ?? []))],
        passages: judged.length,
        tasks,
        orals: tally(owed.filter((t) => t.kind === "oral")),
        reports: tally(owed.filter((t) => t.kind === "report")),
        all: tally(owed),
        strays: tasks.length - owed.length,
        meanPercent: mean(graded.map((t) => t.percent!)),
        gap: mean(graded.flatMap((t) => (t.others === null ? [] : [t.percent! - t.others]))),
      };
    })
    .filter((sheet) => sheet.tasks.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
