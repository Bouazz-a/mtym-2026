import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { teamsOf } from "./passages";

// Passages in which the team plays any role.
function passagesOfTeam(teamId: string): Prisma.PassageWhereInput {
  return {
    OR: [
      { defenderTeamId: teamId },
      { opponentTeamId: teamId },
      { reporterTeamId: teamId },
      { extraTeamId: teamId },
    ],
  };
}

// A team is locked once it appears in a drawn pool: moving it to another
// day (or deleting it on re-import) would silently break that draw.
export async function isTeamInPool(teamId: string): Promise<boolean> {
  return (await db.passage.count({ where: passagesOfTeam(teamId) })) > 0;
}

export async function isPoolJuror(accountId: string, poolId: string): Promise<boolean> {
  return (await db.poolJuror.count({ where: { accountId, poolId } })) > 0;
}

// Teams a juror may see: every team of every pool they sit on.
export async function juryTeamIds(accountId: string): Promise<string[]> {
  const passages = await db.passage.findMany({
    where: { pool: { jurors: { some: { accountId } } } },
    select: { defenderTeamId: true, opponentTeamId: true, reporterTeamId: true, extraTeamId: true },
  });
  return [...new Set(passages.flatMap(teamsOf))];
}

// A juror grades (and so may read) a team's report only for the problem
// that team defends in one of the juror's pools.
export async function juryCanAccessReport(
  accountId: string,
  teamId: string,
  problemNumber: number,
): Promise<boolean> {
  const count = await db.passage.count({
    where: {
      defenderTeamId: teamId,
      problemNumber,
      pool: { jurors: { some: { accountId } } },
    },
  });
  return count > 0;
}

// Once any grade exists for a day, its pools are frozen: redrawing or
// swapping teams would detach those grades from the lineup they were given for.
export async function isDayGraded(centerDayId: string): Promise<boolean> {
  const [oral, report] = await Promise.all([
    db.oralEvaluation.count({ where: { passage: { pool: { centerDayId } } } }),
    db.reportEvaluation.count({ where: { team: { centerDayId } } }),
  ]);
  return oral + report > 0;
}
