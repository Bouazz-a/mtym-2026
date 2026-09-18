import type { Prisma } from "@prisma/client";
import { db } from "../db";

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

// Passages where the juror sits in the judging duo.
export function passagesJudgedBy(accountId: string): Prisma.PassageWhereInput {
  return { duo: { members: { some: { accountId } } } };
}

// A duo is frozen once one of its members has graded one of its passages.
export async function isDuoGraded(duoId: string): Promise<boolean> {
  const [oral, report] = await Promise.all([
    db.oralEvaluation.count({ where: { passage: { duoId } } }),
    db.reportEvaluation.count({
      where: {
        team: { defended: { some: { duoId } } },
        jury: { duoSeats: { some: { duoId } } },
      },
    }),
  ]);
  return oral + report > 0;
}

// Scheduling hints for a duo's passages — never blocking:
//   · the same duo on 2+ passages of one pool (a duo should judge at most
//     one passage per pool)
//   · the same duo on 2+ passages at the same time slot
export async function duoPassageWarnings(duoId: string): Promise<string[]> {
  const duo = await db.juryDuo.findUnique({
    where: { id: duoId },
    include: { passages: { include: { pool: true }, orderBy: { label: "asc" } } },
  });
  if (!duo) return [];

  const warnings: string[] = [];
  const byPool = Map.groupBy(duo.passages, (p) => p.pool.label);
  for (const [poolLabel, passages] of byPool) {
    if (passages.length > 1) {
      warnings.push(`Duo ${duo.number} juge ${passages.length} passages de la poule ${poolLabel} (${passages.map((p) => p.label).join(", ")})`);
    }
  }
  const bySlot = Map.groupBy(duo.passages.filter((p) => p.timeSlot), (p) => p.timeSlot!);
  for (const [slot, passages] of bySlot) {
    if (passages.length > 1) {
      warnings.push(`Duo ${duo.number} a ${passages.length} passages à ${slot} (${passages.map((p) => p.label).join(", ")})`);
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
