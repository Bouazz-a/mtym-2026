import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { authenticate, requireRole, requireOrganizerRole } from "../middleware/auth";
import { NotFoundError } from "../utils/errors";

const router = Router();

const adminOnly = [authenticate, requireRole("organizer"), requireOrganizerRole("admin")];

// GET /api/passages?poolId=&round=
router.get("/", authenticate, async (req, res, next) => {
  try {
    const { poolId, round } = req.query as Record<string, string | undefined>;
    res.json(await db.passage.findMany({
      where: {
        ...(poolId ? { poolId } : {}),
        ...(round ? { pool: { round: parseInt(round, 10) } } : {}),
      },
      include: { pool: { select: { label: true, round: true } } },
    }));
  } catch (err) { next(err); }
});

// PUT /api/passages/:id — update scheduling info (admin)
router.put("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const p = await db.passage.findUnique({ where: { id: req.params.id } });
    if (!p) throw new NotFoundError("Passage not found");

    const data = z.object({
      day: z.string().optional(),
      timeSlot: z.string().optional(),
      room: z.string().optional(),
    }).parse(req.body);

    res.json(await db.passage.update({ where: { id: p.id }, data }));
  } catch (err) { next(err); }
});

export default router;
