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

// PUT /api/passages/:id — update scheduling info, or manually correct the
// role/problem assignment (admin) — the latter is a corrective tool for
// fixing a bad auto-generated lineup by hand, not something the schedule-
// only view needs day-to-day.
router.put("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const p = await db.passage.findUnique({ where: { id: req.params.id } });
    if (!p) throw new NotFoundError("Passage not found");

    // day/timeSlot/room/extraTeamId are nullable columns — a fetched
    // passage round-trips them back as `null`, not just "absent", so the
    // schema has to accept null explicitly or every save that doesn't
    // touch an already-empty field fails validation.
    const data = z.object({
      day: z.string().nullable().optional(),
      timeSlot: z.string().nullable().optional(),
      room: z.string().nullable().optional(),
      problemNumber: z.number().int().optional(),
      defenderTeamId: z.string().uuid().optional(),
      opponentTeamId: z.string().uuid().optional(),
      reporterTeamId: z.string().uuid().optional(),
      extraTeamId: z.string().uuid().nullable().optional(),
    }).parse(req.body);

    res.json(await db.passage.update({ where: { id: p.id }, data }));
  } catch (err) { next(err); }
});

export default router;
