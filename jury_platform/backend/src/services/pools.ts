import type { Prisma } from "@prisma/client";
import { db } from "../db";

export const poolInclude = {
  centerDay: true,
  passages: { orderBy: { label: "asc" } },
  jurors: {
    select: { account: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { account: { lastName: "asc" } },
  },
} satisfies Prisma.PoolInclude;

type PoolRow = Prisma.PoolGetPayload<{ include: typeof poolInclude }>;

// Flattens the PoolJuror join rows into a plain `jurors: Account[]`.
export function toPoolResponse({ jurors, ...pool }: PoolRow) {
  return { ...pool, jurors: jurors.map((j) => j.account) };
}

export async function findPools(where: Prisma.PoolWhereInput) {
  const pools = await db.pool.findMany({ where, include: poolInclude, orderBy: { label: "asc" } });
  return pools.map(toPoolResponse);
}
