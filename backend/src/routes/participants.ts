import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { authenticate, requireRole, requireOrganizerRole } from "../middleware/auth";
import { ForbiddenError, NotFoundError, BadRequestError } from "../utils/errors";

const router = Router();

const UpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  birthDate: z.string().optional(),
  schoolLevel: z.string().optional(),
  hoodieSize: z.string().optional(),
  healthInfo: z.record(z.string()).optional(),
  transportInfo: z.enum(["train", "voiture", "bus", "autre"]).optional(),
  roommatePrefs: z.string().optional(),
});

const CreateSchema = UpdateSchema.extend({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  teamId: z.string().uuid(),
});

// GET /api/participants — organizers get all, participants get themselves
router.get("/", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role === "participant") {
      const p = await db.participant.findUnique({ where: { id: user.id } });
      res.json(p ? [p] : []);
      return;
    }
    if (user.role === "organizer" || user.role === "jury") {
      // jury sees name + teamId only (no sensitive info)
      const fields =
        user.role === "jury"
          ? { id: true, firstName: true, lastName: true, teamId: true }
          : undefined;
      const all = await db.participant.findMany({ select: fields });
      res.json(all);
      return;
    }
    res.status(403).json({ error: "Forbidden" });
  } catch (err) { next(err); }
});

// GET /api/participants/:id
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    const p = await db.participant.findUnique({ where: { id: req.params.id } });
    if (!p) throw new NotFoundError("Participant not found");

    if (user.role === "participant" && user.id !== p.id) {
      // Participants can only see themselves
      throw new ForbiddenError();
    }
    if (user.role === "jury") {
      // Jury sees name + teamId only
      res.json({ id: p.id, firstName: p.firstName, lastName: p.lastName, teamId: p.teamId });
      return;
    }
    res.json(p);
  } catch (err) { next(err); }
});

// POST /api/participants — admin only
router.post(
  "/",
  authenticate,
  requireRole("organizer"),
  requireOrganizerRole("admin"),
  async (req, res, next) => {
    try {
      const data = CreateSchema.parse(req.body);
      const existing = await db.participant.findUnique({ where: { email: data.email } });
      if (existing) throw new BadRequestError("Email already registered");

      const p = await db.participant.create({ data });
      res.status(201).json(p);
    } catch (err) { next(err); }
  },
);

// PUT /api/participants/:id — self or admin
router.put("/:id", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    const p = await db.participant.findUnique({ where: { id: req.params.id } });
    if (!p) throw new NotFoundError("Participant not found");

    const isAdmin = user.role === "organizer" && user.organizerRole === "admin";
    if (!isAdmin && user.id !== p.id) throw new ForbiddenError();

    const data = UpdateSchema.parse(req.body);
    const updated = await db.participant.update({ where: { id: p.id }, data });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/participants/:id — admin only
router.delete(
  "/:id",
  authenticate,
  requireRole("organizer"),
  requireOrganizerRole("admin"),
  async (req, res, next) => {
    try {
      const p = await db.participant.findUnique({ where: { id: req.params.id } });
      if (!p) throw new NotFoundError("Participant not found");
      await db.participant.delete({ where: { id: p.id } });
      res.status(204).send();
    } catch (err) { next(err); }
  },
);

export default router;
