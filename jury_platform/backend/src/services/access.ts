import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { teamsOf } from "./passages";
import { passagesJudgedBy } from "./duos";

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

// The juror sits in the duo judging this passage.
export async function isPassageJuror(accountId: string, passageId: string): Promise<boolean> {
  return (await db.passage.count({ where: { id: passageId, ...passagesJudgedBy(accountId) } })) > 0;
}

// Teams a juror may see: every team of the passages their duo judges, and
// the teams of the reports they were handed.
export async function juryTeamIds(accountId: string): Promise<string[]> {
  const [passages, assigned] = await Promise.all([
    db.passage.findMany({
      where: passagesJudgedBy(accountId),
      select: { defenderTeamId: true, opponentTeamId: true, reporterTeamId: true, extraTeamId: true },
    }),
    db.reportAssignment.findMany({ where: { accountId }, select: { report: { select: { teamId: true } } } }),
  ]);
  return [...new Set([...passages.flatMap(teamsOf), ...assigned.map((a) => a.report.teamId)])];
}

// A juror grades (and so may read) a team's report when it's the problem
// that team defends in a passage the juror's duo judges, or when the report
// was handed to them (Affectation des rapports).
export async function juryCanAccessReport(
  accountId: string,
  teamId: string,
  problemNumber: number,
): Promise<boolean> {
  const [judged, assigned] = await Promise.all([
    db.passage.count({ where: { defenderTeamId: teamId, problemNumber, ...passagesJudgedBy(accountId) } }),
    db.reportAssignment.count({ where: { accountId, report: { teamId, problemNumber } } }),
  ]);
  return judged + assigned > 0;
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
