import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import { authenticate, requireRole, requireOrganizerRole } from "../middleware/auth";

const router = Router();

const adminOrLogistics = [
  authenticate,
  requireRole("organizer"),
  requireOrganizerRole("admin", "logistics"),
];

// GET /api/workshop-assignments
router.get("/", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role === "participant") {
      res.json(await db.workshopAssignment.findUnique({ where: { participantId: user.id } }) ?? null);
      return;
    }
    res.json(await db.workshopAssignment.findMany());
  } catch (err) { next(err); }
});

// POST /api/workshop-assignments/auto — greedy assignment by preference order
router.post("/auto", ...adminOrLogistics, async (_req, res, next) => {
  try {
    const [workshops, preferences, participants] = await Promise.all([
      db.workshop.findMany(),
      db.workshopPreference.findMany(),
      db.participant.findMany(),
    ]);

    const capacityLeft = new Map(workshops.map((w) => [w.id, w.capacity]));
    const assignments: { id: string; participantId: string; workshopId: string }[] = [];
    const assigned = new Set<string>();

    const tryAssign = (participantId: string, workshopId: string) => {
      const cap = capacityLeft.get(workshopId) ?? 0;
      if (cap > 0 && !assigned.has(participantId)) {
        assignments.push({ id: uuidv4(), participantId, workshopId });
        capacityLeft.set(workshopId, cap - 1);
        assigned.add(participantId);
        return true;
      }
      return false;
    };

    for (const key of ["choice1Id", "choice2Id", "choice3Id"] as const) {
      for (const pref of preferences) tryAssign(pref.participantId, pref[key]);
    }

    const withCapacity = workshops.filter((w) => (capacityLeft.get(w.id) ?? 0) > 0);
    for (const p of participants) {
      if (assigned.has(p.id)) continue;
      for (const w of withCapacity) { if (tryAssign(p.id, w.id)) break; }
    }

    await db.$transaction(async (tx) => {
      await tx.workshopAssignment.deleteMany();
      await tx.workshopAssignment.createMany({ data: assignments });
    });

    res.json(assignments);
  } catch (err) { next(err); }
});

export default router;
