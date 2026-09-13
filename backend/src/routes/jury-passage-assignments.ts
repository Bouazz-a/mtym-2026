import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { authenticate, requireRole, requireOrganizerRole } from "../middleware/auth";

const router = Router();

const adminOnly = [authenticate, requireRole("organizer"), requireOrganizerRole("admin")];

// GET /api/jury-passage-assignments
router.get("/", authenticate, async (_req, res, next) => {
  try {
    res.json(await db.juryPassageAssignment.findMany());
  } catch (err) { next(err); }
});

// POST /api/jury-passage-assignments/save
router.post("/save", ...adminOnly, async (req, res, next) => {
  try {
    const assignments = z.array(z.object({
      juryMemberId: z.string().uuid(),
      passageId: z.string().uuid(),
    })).parse(req.body);

    await db.$transaction(async (tx) => {
      await tx.juryPassageAssignment.deleteMany();
      await tx.juryPassageAssignment.createMany({ data: assignments });
    });

    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
