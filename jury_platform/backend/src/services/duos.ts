import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { ConflictError } from "../utils/errors";
import { dayName } from "./audit";
import type { ScheduleSlot } from "./schedule";

// A duo = two jurors who judge together for a whole day. Each passage of
// that day gets one duo.

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

// A juror has at most one specialty: the problem of their duos, all days
// and centers together. A duo therefore only forms between jurors of the
// same specialty (or without one yet), and takes that problem.
//
// Returns the problem the duo must have: `wanted` when given, otherwise
// the jurors' specialty (null if they have none). Throws when the jurors'
// specialties differ, or differ from `wanted`. `exceptDuoId`: the duo being
// edited, left out of the jurors' specialties.
export async function duoProblemFor(
  accountIds: string[],
  wanted: number | null | undefined,
  exceptDuoId?: string,
): Promise<number | null> {
  const seats = await db.duoMember.findMany({
    where: {
      accountId: { in: accountIds },
      duo: { problemNumber: { not: null }, ...(exceptDuoId ? { id: { not: exceptDuoId } } : {}) },
    },
    include: { account: true, duo: { include: { centerDay: true } } },
    orderBy: { duo: { centerDay: { date: "asc" } } },
  });
  // Each specialty found, with who has it and where it comes from
  const specialties = new Map<number, string>();
  for (const { account, duo } of seats) {
    const p = duo.problemNumber!;
    if (!specialties.has(p)) {
      specialties.set(p, `${account.firstName} ${account.lastName} est spécialiste du P${p} (Duo ${duo.number}, ${dayName(duo.centerDay)})`);
    }
  }
  if (specialties.size > 1) {
    throw new ConflictError(`Un juré n'a qu'une spécialité, et un duo réunit deux jurés de la même : ${[...specialties.values()].join(" ; ")}`);
  }
  const [specialty] = [...specialties.keys()];
  if (wanted != null && specialty !== undefined && wanted !== specialty) {
    throw new ConflictError(`${specialties.get(specialty)} : ce duo ne peut pas prendre le P${wanted}`);
  }
  return wanted === undefined ? specialty ?? null : wanted;
}

// Passages where the juror sits in the judging duo.
export function passagesJudgedBy(accountId: string): Prisma.PassageWhereInput {
  return { duo: { members: { some: { accountId } } } };
}

// Which of these passages already carry a grade — the oral of the passage
// itself, or the written report of the team defending in it. Their duo is
// then frozen (same rule as a single assignment, in one query pair).
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
      select: { teamId: true, problemNumber: true },
    }),
  ]);
  const reported = new Set(reports.map((r) => `${r.teamId}:${r.problemNumber}`));
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
  const [oral, report] = await Promise.all([
    db.oralEvaluation.count({ where: { passage: { duoId } } }),
    duo.passages.length === 0
      ? 0
      : db.reportEvaluation.count({
        where: {
          juryId: { in: duo.members.map((m) => m.accountId) },
          OR: duo.passages.map((p) => ({ teamId: p.defenderTeamId, problemNumber: p.problemNumber })),
        },
      }),
  ]);
  return oral + report > 0;
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
