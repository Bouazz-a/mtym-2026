import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { DrawPool } from "./draw";
import { duoInclude, toDuoResponse } from "./duos";
import { teamsOf, type Lineup } from "./passages";
import { teamsInGrid, type PoolGrid } from "./poolGrid";

export const poolInclude = {
  centerDay: true,
  passages: {
    include: { duo: { include: duoInclude } },
    orderBy: { label: "asc" },
  },
} satisfies Prisma.PoolInclude;

type PoolRow = Prisma.PoolGetPayload<{ include: typeof poolInclude }>;

// Each passage carries its judging duo (or null) with the duo's jurors.
export function toPoolResponse({ passages, ...pool }: PoolRow) {
  return {
    ...pool,
    passages: passages.map(({ duo, ...p }) => ({ ...p, duo: duo && toDuoResponse(duo) })),
  };
}

// Any change to a day's composition (pools, lineups) unsettles it: the day
// has to be validated again, so "Tirage validé" never lies.
export async function clearDrawValidation(tx: Prisma.TransactionClient, centerDayId: string | null) {
  if (!centerDayId) return;
  await tx.centerDay.updateMany({
    where: { id: centerDayId, NOT: { drawValidatedAt: null } },
    data: { drawValidatedAt: null, drawValidatedBy: null },
  });
}

// Teams already placed in these pools: in their passages, or in the grid of
// a pool still being composed by hand.
export function teamsInPools(pools: { passages: Lineup[]; draft: Prisma.JsonValue }[]): Set<string> {
  const taken = new Set<string>();
  for (const pool of pools) {
    for (const p of pool.passages) for (const id of teamsOf(p)) taken.add(id);
    const draft = pool.draft as unknown as PoolGrid | null;
    if (draft) for (const id of teamsInGrid(draft)) taken.add(id);
  }
  return taken;
}

// The (slot, problem) of every passage of these pools, drafts included —
// what new pools of the same day balance their problems against.
export function playedProblems(
  pools: { passages: { slot: number; problemNumber: number }[]; draft: Prisma.JsonValue }[],
): { slot: number; problemNumber: number }[] {
  return pools.flatMap((pool) => {
    const draft = pool.draft as unknown as PoolGrid | null;
    return [...pool.passages, ...(draft?.passages ?? [])].map(({ slot, problemNumber }) => ({ slot, problemNumber }));
  });
}

// A draw's pools, saved with their passages (no duo yet).
export async function createPools(tx: Prisma.TransactionClient, centerDayId: string, pools: DrawPool[]) {
  for (const pool of pools) {
    await tx.pool.create({
      data: {
        label: pool.label,
        centerDayId,
        passages: { create: pool.passages.map((p) => ({ ...p, extraTeamId: p.extraTeamId ?? null })) },
      },
    });
  }
}

export async function findPools(where: Prisma.PoolWhereInput) {
  const pools = await db.pool.findMany({ where, include: poolInclude, orderBy: { label: "asc" } });
  return pools.map(toPoolResponse);
}
