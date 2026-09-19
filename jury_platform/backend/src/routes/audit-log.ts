import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly } from "../middleware/auth";

// GET /api/audit-log?from&to&actorId&category — the journal of admin
// changes, newest first. A competition makes a few thousand entries at
// most, so it's returned whole; the page filters and exports it.
const router = Router();
router.use(...adminOnly);

const QuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  actorId: z.string().uuid().optional(),
  category: z.string().optional(),
});

router.get("/", async (req, res, next) => {
  try {
    const { from, to, actorId, category } = QuerySchema.parse(req.query);
    res.json(await db.auditLog.findMany({
      where: {
        ...(from || to ? { at: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {}),
        ...(actorId && { actorId }),
        ...(category && { category }),
      },
      orderBy: { at: "desc" },
    }));
  } catch (err) { next(err); }
});

export default router;
