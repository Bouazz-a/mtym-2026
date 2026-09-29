import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { teamsOf } from "./passages";

// The reports handed out to jurors: every report of a team placed in a
// validated day's pools, except the one of the problem the team defends —
// that one is graded by the duo of its passage.
//
// Only validated days count: a team's defended problem is only final once
// its day's draw is settled. If the pools change afterwards, the reports
// already handed out are sorted out when the day is validated again
// (services/reportValidation.ts).

export interface PoolReport {
  id: string;
  teamId: string;
  problemNumber: number;
  accountId: string | null; // the juror correcting it
  graded: boolean; // that juror has already saved a grade
}

export interface ReportPool {
  reports: PoolReport[];
  /** Days with pools whose draw isn't validated: their teams wait */
  pendingDays: { id: string; center: string; date: string }[];
}

export async function reportPool(): Promise<ReportPool> {
  const days = await db.centerDay.findMany({
    where: { pools: { some: {} } },
    include: { pools: { include: { passages: true } } },
    orderBy: [{ center: "asc" }, { date: "asc" }],
  });

  const defended = new Map<string, Set<number>>(); // team -> problems it defends
  const placed = new Set<string>();
  for (const day of days.filter((d) => d.drawValidatedAt)) {
    for (const passage of day.pools.flatMap((p) => p.passages)) {
      teamsOf(passage).forEach((t) => placed.add(t));
      defended.set(passage.defenderTeamId, (defended.get(passage.defenderTeamId) ?? new Set()).add(passage.problemNumber));
    }
  }

  const [reports, evaluations] = await Promise.all([
    db.teamReport.findMany({ where: { teamId: { in: [...placed] } }, include: { assignment: true } }),
    db.reportEvaluation.findMany({
      where: { teamId: { in: [...placed] } },
      select: { juryId: true, teamId: true, problemNumber: true },
    }),
  ]);
  const gradedBy = new Set(evaluations.map((e) => `${e.juryId}:${e.teamId}:${e.problemNumber}`));

  return {
    reports: reports
      .filter((r) => !defended.get(r.teamId)?.has(r.problemNumber))
      .map((r) => {
        const accountId = r.assignment?.accountId ?? null;
        return {
          id: r.id,
          teamId: r.teamId,
          problemNumber: r.problemNumber,
          accountId,
          graded: accountId !== null && gradedBy.has(`${accountId}:${r.teamId}:${r.problemNumber}`),
        };
      }),
    pendingDays: days.filter((d) => !d.drawValidatedAt).map(({ id, center, date }) => ({ id, center, date })),
  };
}

// Every juror (jury accounts and admins who also judge) with the problems
// of its duos, all days together (its specialties)
export async function jurorProblems(client: Prisma.TransactionClient = db): Promise<{ id: string; problems: number[] }[]> {
  const accounts = await client.account.findMany({
    where: { isJuror: true },
    include: { duoSeats: { include: { duo: { select: { problemNumber: true } } } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return accounts.map((a) => ({
    id: a.id,
    problems: [...new Set(a.duoSeats.flatMap((s) => (s.duo.problemNumber ? [s.duo.problemNumber] : [])))].sort(),
  }));
}
