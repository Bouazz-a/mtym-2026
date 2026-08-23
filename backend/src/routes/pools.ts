import { Router } from "express";
import { db } from "../db";
import { authenticate } from "../middleware/auth";

const router = Router();

// GET /api/pools?round=
router.get("/", authenticate, async (req, res, next) => {
  try {
    const round = req.query.round ? parseInt(req.query.round as string, 10) : undefined;
    res.json(await db.pool.findMany({
      where: round ? { round } : undefined,
      include: { passages: true },
    }));
  } catch (err) { next(err); }
});

export default router;
