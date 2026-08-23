import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { authenticate, requireRole, requireOrganizerRole } from "../middleware/auth";
import { NotFoundError, BadRequestError, ForbiddenError } from "../utils/errors";

const router = Router();

const CreateSchema = z.object({
  name: z.string().min(1),
  quadrigramme: z.string().length(4),
});

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  quadrigramme: z.string().length(4).optional(),
  creatorId: z.string().uuid().optional(),
});

// GET /api/teams — public
router.get("/", authenticate, async (_req, res, next) => {
  try {
    const teams = await db.team.findMany({
      include: { participants: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.json(teams);
  } catch (err) { next(err); }
});

// GET /api/teams/:id
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const team = await db.team.findUnique({
      where: { id: req.params.id },
      include: { participants: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!team) throw new NotFoundError("Team not found");
    res.json(team);
  } catch (err) { next(err); }
});

// POST /api/teams — participant creates their team
router.post("/", authenticate, requireRole("participant"), async (req, res, next) => {
  try {
    const user = req.user!;
    const data = CreateSchema.parse(req.body);

    const existing = await db.team.findUnique({ where: { quadrigramme: data.quadrigramme } });
    if (existing) throw new BadRequestError("Quadrigramme déjà utilisé");

    const team = await db.team.create({
      data: { ...data, creatorId: user.id },
    });
    // Assign the creator to the team
    await db.participant.update({
      where: { id: user.id },
      data: { teamId: team.id },
    });
    res.status(201).json(team);
  } catch (err) { next(err); }
});

// PUT /api/teams/:id — admin only
router.put(
  "/:id",
  authenticate,
  requireRole("organizer"),
  requireOrganizerRole("admin"),
  async (req, res, next) => {
    try {
      const team = await db.team.findUnique({ where: { id: req.params.id } });
      if (!team) throw new NotFoundError("Team not found");

      const data = UpdateSchema.parse(req.body);
      if (data.quadrigramme && data.quadrigramme !== team.quadrigramme) {
        const conflict = await db.team.findUnique({ where: { quadrigramme: data.quadrigramme } });
        if (conflict) throw new BadRequestError("Quadrigramme déjà utilisé");
      }

      const updated = await db.team.update({ where: { id: team.id }, data });
      res.json(updated);
    } catch (err) { next(err); }
  },
);

// PUT /api/teams/:id/move-participant — admin moves a participant to a different team
router.put(
  "/:id/move-participant",
  authenticate,
  requireRole("organizer"),
  requireOrganizerRole("admin"),
  async (req, res, next) => {
    try {
      const { participantId } = z.object({ participantId: z.string().uuid() }).parse(req.body);
      const team = await db.team.findUnique({ where: { id: req.params.id } });
      if (!team) throw new NotFoundError("Team not found");
      const participant = await db.participant.findUnique({ where: { id: participantId } });
      if (!participant) throw new NotFoundError("Participant not found");

      await db.participant.update({ where: { id: participantId }, data: { teamId: team.id } });
      res.json({ ok: true });
    } catch (err) { next(err); }
  },
);

// DELETE /api/teams/:id — admin only
router.delete(
  "/:id",
  authenticate,
  requireRole("organizer"),
  requireOrganizerRole("admin"),
  async (req, res, next) => {
    try {
      const team = await db.team.findUnique({ where: { id: req.params.id } });
      if (!team) throw new NotFoundError("Team not found");
      await db.team.delete({ where: { id: team.id } });
      res.status(204).send();
    } catch (err) { next(err); }
  },
);

export default router;
