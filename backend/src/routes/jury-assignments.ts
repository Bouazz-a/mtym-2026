import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { authenticate, requireRole, requireOrganizerRole } from "../middleware/auth";

const router = Router();

const adminOnly = [authenticate, requireRole("organizer"), requireOrganizerRole("admin")];

// ─── Report assignments (/api/jury-assignments) ───────────────────────────────

// GET /api/jury-assignments
router.get("/", authenticate, async (_req, res, next) => {
  try {
    res.json(await db.juryAssignment.findMany());
  } catch (err) { next(err); }
});

// POST /api/jury-assignments/save
router.post("/save", ...adminOnly, async (req, res, next) => {
  try {
    const assignments = z.array(z.object({
      juryMemberId: z.string().uuid(),
      teamId: z.string().uuid(),
      reportType: z.enum(["intermediaire", "final"]),
    })).parse(req.body);

    await db.$transaction(async (tx) => {
      await tx.juryAssignment.deleteMany();
      await tx.juryAssignment.createMany({ data: assignments });
    });

    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
