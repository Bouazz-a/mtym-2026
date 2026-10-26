import type { Prisma } from "@prisma/client";

// The admissible teams (page Admissibles): the first λ × n teams of the
// ranking by admissibility note, where the report graded at the oral stands
// for the written part. An admin fixes the list; while it exists:
//   · only the admissibles' reports are handed out (reportPool.ts, and
//     reportValidation.ts when a day is validated again);
//   · the other teams' reports, the defended one aside, count 0 — the
//     interface works the notes out (frontend lib/services/results.ts);
//   · fixing it takes back from their jurors the other teams' reports not
//     graded yet. Those already graded stay with their juror and count 0:
//     nothing is deleted, so reopening the list brings their notes back.

export async function admissibleIds(client: Prisma.TransactionClient): Promise<Set<string> | null> {
  const list = await client.admissibleList.findUnique({ where: { id: 1 } });
  return list ? new Set(list.teamIds) : null;
}

export interface HandedReport {
  reportId: string;
  teamId: string;
  problemNumber: number;
  accountId: string; // the juror holding it
}

// The reports handed out to teams outside the list: those their juror hasn't
// graded go back, the graded ones stay where they are
export function sortOutReports(
  handed: HandedReport[],
  graded: { juryId: string; teamId: string; problemNumber: number }[],
  admissible: Set<string>,
): { takeBack: HandedReport[]; keep: HandedReport[] } {
  const done = new Set(graded.map((g) => `${g.juryId}:${g.teamId}:${g.problemNumber}`));
  const outside = handed.filter((r) => !admissible.has(r.teamId));
  return {
    takeBack: outside.filter((r) => !done.has(`${r.accountId}:${r.teamId}:${r.problemNumber}`)),
    keep: outside.filter((r) => done.has(`${r.accountId}:${r.teamId}:${r.problemNumber}`)),
  };
}

// What fixing the list does to the reports already handed out
export interface AdmissiblesImpact {
  takenBack: { reportId: string; team: string; problemNumber: number; juror: string }[];
  keptGraded: { team: string; problemNumber: number; juror: string }[]; // stay with their juror, count 0
}

export async function planAdmissibles(client: Prisma.TransactionClient, teamIds: string[]): Promise<AdmissiblesImpact> {
  const admissible = new Set(teamIds);
  const assignments = await client.reportAssignment.findMany({
    where: { report: { teamId: { notIn: teamIds } } },
    include: {
      report: { select: { teamId: true, problemNumber: true, team: { select: { quadrigram: true } } } },
      account: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ report: { team: { quadrigram: "asc" } } }, { report: { problemNumber: "asc" } }],
  });
  const graded = await client.reportEvaluation.findMany({
    where: { teamId: { in: [...new Set(assignments.map((a) => a.report.teamId))] } },
    select: { juryId: true, teamId: true, problemNumber: true },
  });
  const byId = new Map(assignments.map((a) => [a.reportId, a]));
  const { takeBack, keep } = sortOutReports(
    assignments.map((a) => ({ reportId: a.reportId, teamId: a.report.teamId, problemNumber: a.report.problemNumber, accountId: a.accountId })),
    graded,
    admissible,
  );
  const describe = (r: HandedReport) => {
    const a = byId.get(r.reportId)!;
    return { team: a.report.team.quadrigram, problemNumber: r.problemNumber, juror: `${a.account.firstName} ${a.account.lastName}` };
  };
  return {
    takenBack: takeBack.map((r) => ({ reportId: r.reportId, ...describe(r) })),
    keptGraded: keep.map(describe),
  };
}

export async function applyAdmissibles(tx: Prisma.TransactionClient, impact: AdmissiblesImpact) {
  if (impact.takenBack.length) {
    await tx.reportAssignment.deleteMany({ where: { reportId: { in: impact.takenBack.map((r) => r.reportId) } } });
  }
}
