import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import { authenticate } from "../middleware/auth";
import { ForbiddenError } from "../utils/errors";

const router = Router();

const PrefSchema = z.object({
  choice1Id: z.string().uuid(),
  choice2Id: z.string().uuid(),
  choice3Id: z.string().uuid(),
  participantId: z.string().uuid().optional(), // admin can override
});

// GET /api/workshop-preferences
router.get("/", authenticate, async (_req, res, next) => {
  try {
    const user = _req.user!;
    if (user.role === "participant") {
      res.json(await db.workshopPreference.findUnique({ where: { participantId: user.id } }) ?? null);
      return;
    }
    res.json(await db.workshopPreference.findMany());
  } catch (err) { next(err); }
});

// PUT /api/workshop-preferences
router.put("/", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role === "jury") throw new ForbiddenError();

    const data = PrefSchema.parse(req.body);
    const participantId =
      user.role === "organizer" && data.participantId ? data.participantId : user.id;

    if (user.role === "participant" && participantId !== user.id) throw new ForbiddenError();

    res.json(await db.workshopPreference.upsert({
      where: { participantId },
      create: { id: uuidv4(), participantId, choice1Id: data.choice1Id, choice2Id: data.choice2Id, choice3Id: data.choice3Id },
      update: { choice1Id: data.choice1Id, choice2Id: data.choice2Id, choice3Id: data.choice3Id },
    }));
  } catch (err) { next(err); }
});

export default router;
