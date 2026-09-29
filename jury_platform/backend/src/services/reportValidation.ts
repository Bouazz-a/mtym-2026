import type { Prisma } from "@prisma/client";
import { planReportAssignment } from "../algorithms/reportAssignment";
import { teamsOf } from "./passages";
import { jurorProblems } from "./reportPool";

// What validating a day's draw does to its teams' reports already handed
// out to jurors — for a day validated again after its pools changed (a team
// withdrew, the pools were reshuffled):
//
//   · a report of the problem its team now defends leaves its juror, and
//     that juror's grade is cancelled: the duo of the passage grades it now;
//   · the reports of a team left without a pool leave their jurors too,
//     grades included;
//   · the reports now to hand out (a problem the team no longer defends) go
//     to jurors with « Compléter »'s rules (algorithms/reportAssignment.ts),
//     when the day's reports were already handed out — a first validation
//     hands out nothing, the admin does it on Affectation des rapports;
//   · every other report keeps its juror and its grade.
//
// The admin sees it before validating (GET /api/center-days/:id/draw-
// validation); the validation applies it in the same transaction.

export interface ReportChange {
  reportId: string;
  team: string; // quadrigram
  problemNumber: number;
  juror: string; // "Ines Uitest"
}

export interface ValidationImpact {
  removed: (ReportChange & { graded: boolean; reason: "defended" | "withoutPool" })[];
  assigned: ReportChange[];
  unassigned: Omit<ReportChange, "juror">[]; // to hand out, but no juror has a problem yet
}

interface ValidationPlan {
  impact: ValidationImpact;
  evaluationIds: string[]; // the cancelled grades
  removedReportIds: string[];
  assignments: { reportId: string; accountId: string }[];
}

const fullName = (a: { firstName: string; lastName: string }) => `${a.firstName} ${a.lastName}`;

export async function planValidation(client: Prisma.TransactionClient, centerDayId: string): Promise<ValidationPlan> {
  const [teams, passages] = await Promise.all([
    client.team.findMany({ where: { centerDayId }, select: { id: true, quadrigram: true } }),
    client.passage.findMany({ where: { pool: { centerDayId } } }),
  ]);
  const quad = new Map(teams.map((t) => [t.id, t.quadrigram]));
  const placed = new Set(passages.flatMap(teamsOf));
  const defended = new Set(passages.map((p) => `${p.defenderTeamId}:${p.problemNumber}`));
  const isDefended = (r: { teamId: string; problemNumber: number }) => defended.has(`${r.teamId}:${r.problemNumber}`);

  const [reports, evaluations] = await Promise.all([
    client.teamReport.findMany({
      where: { teamId: { in: teams.map((t) => t.id) } },
      include: { assignment: { include: { account: { select: { firstName: true, lastName: true } } } } },
      orderBy: [{ team: { quadrigram: "asc" } }, { problemNumber: "asc" }],
    }),
    client.reportEvaluation.findMany({
      where: { teamId: { in: teams.map((t) => t.id) } },
      select: { id: true, juryId: true, teamId: true, problemNumber: true },
    }),
  ]);
  const evaluationOf = new Map(evaluations.map((e) => [`${e.juryId}:${e.teamId}:${e.problemNumber}`, e.id]));

  const plan: ValidationPlan = { impact: { removed: [], assigned: [], unassigned: [] }, evaluationIds: [], removedReportIds: [], assignments: [] };
  for (const r of reports) {
    if (!r.assignment) continue;
    const reason = !placed.has(r.teamId) ? "withoutPool" : isDefended(r) ? "defended" : null;
    if (!reason) continue;
    const evaluationId = evaluationOf.get(`${r.assignment.accountId}:${r.teamId}:${r.problemNumber}`);
    if (evaluationId) plan.evaluationIds.push(evaluationId);
    plan.removedReportIds.push(r.id);
    plan.impact.removed.push({
      reportId: r.id,
      team: quad.get(r.teamId)!,
      problemNumber: r.problemNumber,
      juror: fullName(r.assignment.account),
      graded: Boolean(evaluationId),
      reason,
    });
  }

  const handedOut = reports.some((r) => r.assignment);
  const open = handedOut ? reports.filter((r) => !r.assignment && placed.has(r.teamId) && !isDefended(r)) : [];
  if (open.length === 0) return plan;

  // Balanced against every juror's current load, the reports leaving them excluded
  const jurors = (await jurorProblems(client)).filter((j) => j.problems.length > 0);
  const kept = await client.reportAssignment.findMany({
    where: { reportId: { notIn: plan.removedReportIds } },
    select: { reportId: true, accountId: true, report: { select: { problemNumber: true } } },
  });
  const { changes } = planReportAssignment(
    [
      ...kept.map((k) => ({ id: k.reportId, problemNumber: k.report.problemNumber, accountId: k.accountId, locked: true })),
      ...open.map((r) => ({ id: r.id, problemNumber: r.problemNumber, accountId: null, locked: false })),
    ],
    jurors,
    "fill",
  );
  const chosen = new Map(changes.flatMap((c) => (c.accountId ? [[c.reportId, c.accountId] as const] : [])));
  const names = new Map(
    (await client.account.findMany({ where: { id: { in: [...chosen.values()] } }, select: { id: true, firstName: true, lastName: true } }))
      .map((a) => [a.id, fullName(a)]),
  );
  for (const r of open) {
    const accountId = chosen.get(r.id);
    const change = { reportId: r.id, team: quad.get(r.teamId)!, problemNumber: r.problemNumber };
    if (accountId) {
      plan.assignments.push({ reportId: r.id, accountId });
      plan.impact.assigned.push({ ...change, juror: names.get(accountId) ?? "?" });
    } else {
      plan.impact.unassigned.push(change);
    }
  }
  return plan;
}

// The plan's report changes, within the validation's transaction
export async function applyValidation(tx: Prisma.TransactionClient, plan: ValidationPlan) {
  if (plan.evaluationIds.length) await tx.reportEvaluation.deleteMany({ where: { id: { in: plan.evaluationIds } } });
  if (plan.removedReportIds.length) await tx.reportAssignment.deleteMany({ where: { reportId: { in: plan.removedReportIds } } });
  if (plan.assignments.length) await tx.reportAssignment.createMany({ data: plan.assignments });
}
