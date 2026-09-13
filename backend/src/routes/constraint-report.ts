import { Router } from "express";
import { db } from "../db";
import { authenticate } from "../middleware/auth";

const router = Router();

// GET /api/constraint-report
router.get("/", authenticate, async (_req, res, next) => {
  try {
    const reports = await db.constraintReport.findMany({
      orderBy: { generatedAt: "desc" },
      take: 1,
    });
    res.json(reports[0] ?? null);
  } catch (err) { next(err); }
});

export default router;
