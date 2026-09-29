import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { ScheduleSlot } from "./schedule";

// A duo = two jurors or more who judge together for a whole day. Each
// passage of that day gets one duo. Its problem (JuryDuo.problemNumber) is
// the admin's free choice: it only steers the automatic assignments.

export const duoInclude = {
  members: {
    select: { account: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { account: { lastName: "asc" } },
  },
} satisfies Prisma.JuryDuoInclude;

type DuoRow = Prisma.JuryDuoGetPayload<{ include: typeof duoInclude }>;

// Flattens the DuoMember join rows into a plain `members: Juror[]`.
export function toDuoResponse({ members, ...duo }: DuoRow) {
  return { ...duo, members: members.map((m) => m.account) };
}

// Passages where the juror sits in the judging duo.
export function passagesJudgedBy(accountId: string): Prisma.PassageWhereInput {
  return { duo: { members: { some: { accountId } } } };
}

// Report grades given by a duo, not by the juror the report is handed to.
// Such a grade can sit on a defended problem: its team defends it only since
// the pools changed, and the grade is cancelled when the day is validated
// again (services/reportValidation.ts) — until then it freezes nothing.
async function duoReportGrades<T extends { juryId: string; teamId: string; problemNumber: number }>(grades: T[]): Promise<T[]> {
  if (grades.length === 0) return grades;
  const handedOut = await db.reportAssignment.findMany({
    where: { report: { teamId: { in: [...new Set(grades.map((g) => g.teamId))] } } },
    select: { accountId: true, report: { select: { teamId: true, problemNumber: true } } },
  });
  const handedTo = new Set(handedOut.map((a) => `${a.accountId}:${a.report.teamId}:${a.report.problemNumber}`));
  return grades.filter((g) => !handedTo.has(`${g.juryId}:${g.teamId}:${g.problemNumber}`));
}

// Which of these passages already carry a grade — the oral of the passage
// itself, or the written report of the team defending in it, graded by the
// duo. Their duo is then frozen (same rule as a single assignment).
export async function gradedPassageIds(passageIds: string[]): Promise<Set<string>> {
  if (passageIds.length === 0) return new Set();
  const passages = await db.passage.findMany({
    where: { id: { in: passageIds } },
    select: { id: true, defenderTeamId: true, problemNumber: true },
  });
  const [orals, reports] = await Promise.all([
    db.oralEvaluation.findMany({ where: { passageId: { in: passageIds } }, select: { passageId: true } }),
    db.reportEvaluation.findMany({
      where: { teamId: { in: passages.map((p) => p.defenderTeamId) } },
      select: { juryId: true, teamId: true, problemNumber: true },
    }),
  ]);
  const reported = new Set((await duoReportGrades(reports)).map((r) => `${r.teamId}:${r.problemNumber}`));
  return new Set([
    ...orals.map((o) => o.passageId),
    ...passages.filter((p) => reported.has(`${p.defenderTeamId}:${p.problemNumber}`)).map((p) => p.id),
  ]);
}

export async function isPassageGraded(passageId: string): Promise<boolean> {
  return (await gradedPassageIds([passageId])).has(passageId);
}

// A duo is frozen once one of its members has graded one of its passages:
// an oral, or the defender's report for the passage's problem (a report of
// another problem, handed to the juror separately, doesn't count).
export async function isDuoGraded(duoId: string): Promise<boolean> {
  const duo = await db.juryDuo.findUnique({
    where: { id: duoId },
    include: { passages: { select: { defenderTeamId: true, problemNumber: true } }, members: { select: { accountId: true } } },
  });
  if (!duo) return false;
  const [oral, reports] = await Promise.all([
    db.oralEvaluation.count({ where: { passage: { duoId } } }),
    duo.passages.length === 0
      ? []
      : db.reportEvaluation.findMany({
        where: {
          juryId: { in: duo.members.map((m) => m.accountId) },
          OR: duo.passages.map((p) => ({ teamId: p.defenderTeamId, problemNumber: p.problemNumber })),
        },
        select: { juryId: true, teamId: true, problemNumber: true },
      }),
  ]);
  return oral > 0 || (await duoReportGrades(reports)).length > 0;
}

// Scheduling hints for a duo's passages — never blocking:
//   · the same duo on 2+ passages of one pool (a duo should judge at most
//     one passage per pool)
//   · the same duo on 2+ passages of the same slot (the day's pools play
//     their passage n in parallel)
export async function duoPassageWarnings(duoId: string): Promise<string[]> {
  const duo = await db.juryDuo.findUnique({
    where: { id: duoId },
    include: { passages: { include: { pool: true }, orderBy: { label: "asc" } }, centerDay: true },
  });
  if (!duo) return [];

  const warnings: string[] = [];
  const byPool = Map.groupBy(duo.passages, (p) => p.pool.label);
  for (const [poolLabel, passages] of byPool) {
    if (passages.length > 1) {
      warnings.push(`Duo ${duo.number} juge ${passages.length} passages de la poule ${poolLabel} (${passages.map((p) => p.label).join(", ")})`);
    }
  }
  const schedule = duo.centerDay.schedule as unknown as ScheduleSlot[];
  const bySlot = Map.groupBy(duo.passages, (p) => p.slot);
  for (const [slot, passages] of bySlot) {
    if (passages.length > 1) {
      const time = schedule[slot - 1]?.start ?? `créneau ${slot}`;
      warnings.push(`Duo ${duo.number} a ${passages.length} passages à ${time} (${passages.map((p) => p.label).join(", ")})`);
    }
  }
  return warnings;
}

// Jurors also seated in a duo of another center on the same date.
export async function jurorDateWarnings(accountIds: string[], centerDayId: string): Promise<string[]> {
  const day = await db.centerDay.findUniqueOrThrow({ where: { id: centerDayId } });
  const elsewhere = await db.duoMember.findMany({
    where: {
      accountId: { in: accountIds },
      duo: { centerDay: { date: day.date, id: { not: day.id } } },
    },
    include: { account: true, duo: { include: { centerDay: true } } },
  });
  return elsewhere.map(
    (m) => `${m.account.firstName} ${m.account.lastName} est aussi dans le Duo ${m.duo.number} de ${m.duo.centerDay.center} le même jour`,
  );
}
