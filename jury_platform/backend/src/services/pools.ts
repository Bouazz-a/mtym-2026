import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { duoInclude, toDuoResponse } from "./duos";

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

export async function findPools(where: Prisma.PoolWhereInput) {
  const pools = await db.pool.findMany({ where, include: poolInclude, orderBy: { label: "asc" } });
  return pools.map(toPoolResponse);
}
