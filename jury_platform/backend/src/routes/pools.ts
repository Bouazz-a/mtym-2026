import { Router } from "express";
import { z } from "zod";
import { Center, type Prisma } from "@prisma/client";
import { db } from "../db";
import { adminOnly, authenticate } from "../middleware/auth";
import { findPools, poolInclude, toPoolResponse } from "../services/pools";
import { BadRequestError, NotFoundError } from "../utils/errors";

const router = Router();

const ListQuery = z.object({
  center: z.nativeEnum(Center).optional(),
  centerDayId: z.string().uuid().optional(),
});

// GET /api/pools?center=&centerDayId= — admin: all pools; jury: the pools they sit on
router.get("/", authenticate, async (req, res, next) => {
  try {
    const { center, centerDayId } = ListQuery.parse(req.query);
    const user = req.user!;
    const where: Prisma.PoolWhereInput = {
      ...(centerDayId ? { centerDayId } : {}),
      ...(center ? { centerDay: { center } } : {}),
      ...(user.role === "jury" ? { jurors: { some: { accountId: user.id } } } : {}),
    };
    res.json(await findPools(where));
  } catch (err) { next(err); }
});

// PUT /api/pools/:id/jurors — { accountIds: [a, b] } (at most 2). Answers
// the updated pool plus `warnings` for jurors already seated in another
// pool on the same date — allowed, since the Excel plan is authoritative.
router.put("/:id/jurors", ...adminOnly, async (req, res, next) => {
  try {
    const { accountIds } = z.object({
      accountIds: z.array(z.string().uuid()).max(2, "Deux jurés au maximum par poule"),
    }).parse(req.body);
    if (new Set(accountIds).size !== accountIds.length) {
      throw new BadRequestError("Le même juré est sélectionné deux fois");
    }

    const pool = await db.pool.findUnique({ where: { id: req.params.id }, include: { centerDay: true } });
    if (!pool) throw new NotFoundError("Pool not found");

    const jurors = await db.account.count({ where: { id: { in: accountIds }, role: "jury" } });
    if (jurors !== accountIds.length) throw new BadRequestError("Seuls des comptes jury peuvent être affectés");

    await db.$transaction([
      db.poolJuror.deleteMany({ where: { poolId: pool.id } }),
      db.poolJuror.createMany({ data: accountIds.map((accountId) => ({ poolId: pool.id, accountId })) }),
    ]);

    const clashes = pool.centerDay
      ? await db.poolJuror.findMany({
          where: {
            accountId: { in: accountIds },
            poolId: { not: pool.id },
            pool: { centerDay: { date: pool.centerDay.date } },
          },
          include: { account: true, pool: { include: { centerDay: true } } },
        })
      : [];

    const updated = await db.pool.findUniqueOrThrow({ where: { id: pool.id }, include: poolInclude });
    res.json({
      pool: toPoolResponse(updated),
      warnings: clashes.map((c) =>
        `${c.account.firstName} ${c.account.lastName} est aussi dans la poule ${c.pool.label} (${c.pool.centerDay?.center}) le même jour`,
      ),
    });
  } catch (err) { next(err); }
});

export default router;
