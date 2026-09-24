import { db } from "../db";
import { ConflictError } from "../utils/errors";
import { teamsOf } from "./passages";

// The reports handed out to jurors: every report of a team placed in a
// validated day's pools, except the one of the problem the team defends —
// that one is graded by the duo of its passage.
//
// Only validated days count: a team's defended problem is only final once
// its day's draw is settled, and assigned reports then freeze that draw
// (assertNoAssignedReports).

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

// Every jury account with the problems of its duos (its specialties)
export async function jurorProblems(): Promise<{ id: string; problems: number[] }[]> {
  const accounts = await db.account.findMany({
    where: { role: "jury" },
    include: { duoSeats: { include: { duo: { select: { problemNumber: true } } } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return accounts.map((a) => ({
    id: a.id,
    problems: [...new Set(a.duoSeats.flatMap((s) => (s.duo.problemNumber ? [s.duo.problemNumber] : [])))].sort(),
  }));
}

// A handed-out report depends on the lineup that left it out of the
// defended ones: while any is assigned, the teams' pools can't change.
export async function assertNoAssignedReports(where: { centerDayId: string } | { teamIds: string[] }) {
  const count = await db.reportAssignment.count({
    where: { report: { team: "centerDayId" in where ? { centerDayId: where.centerDayId } : { id: { in: where.teamIds } } } },
  });
  if (count > 0) {
    throw new ConflictError(
      `${count} rapport${count > 1 ? "s" : ""} de ces équipes ${count > 1 ? "sont attribués" : "est attribué"} à des jurés — retirez-les dans Affectation des rapports avant de modifier les poules`,
    );
  }
}
