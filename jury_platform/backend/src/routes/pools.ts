import { Router } from "express";
import { z } from "zod";
import { Center, type Prisma } from "@prisma/client";
import { authenticate } from "../middleware/auth";
import { passagesJudgedBy } from "../services/duos";
import { findPools } from "../services/pools";

const router = Router();

const ListQuery = z.object({
  center: z.nativeEnum(Center).optional(),
  centerDayId: z.string().uuid().optional(),
});

// GET /api/pools?center=&centerDayId= — admin: all pools; jury: the pools
// where their duo judges at least one passage
router.get("/", authenticate, async (req, res, next) => {
  try {
    const { center, centerDayId } = ListQuery.parse(req.query);
    const user = req.user!;
    const where: Prisma.PoolWhereInput = {
      ...(centerDayId ? { centerDayId } : {}),
      ...(center ? { centerDay: { center } } : {}),
      ...(user.role === "jury" ? { passages: { some: passagesJudgedBy(user.id) } } : {}),
    };
    res.json(await findPools(where));
  } catch (err) { next(err); }
});

export default router;
