import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { authenticate, requireRole, requireOrganizerRole } from "../middleware/auth";
import { NotFoundError } from "../utils/errors";

const router = Router();

const adminOrLogistics = [
  authenticate,
  requireRole("organizer"),
  requireOrganizerRole("admin", "logistics"),
];

const WorkshopSchema = z.object({
  name: z.string().min(1),
  instructor: z.string().min(1),
  capacity: z.number().int().positive(),
  slot: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

// GET /api/workshops
router.get("/", authenticate, async (_req, res, next) => {
  try {
    res.json(await db.workshop.findMany());
  } catch (err) { next(err); }
});

// POST /api/workshops
router.post("/", ...adminOrLogistics, async (req, res, next) => {
  try {
    res.status(201).json(await db.workshop.create({ data: WorkshopSchema.parse(req.body) }));
  } catch (err) { next(err); }
});

// PUT /api/workshops/:id
router.put("/:id", ...adminOrLogistics, async (req, res, next) => {
  try {
    const w = await db.workshop.findUnique({ where: { id: req.params.id } });
    if (!w) throw new NotFoundError("Workshop not found");
    res.json(await db.workshop.update({ where: { id: w.id }, data: WorkshopSchema.partial().parse(req.body) }));
  } catch (err) { next(err); }
});

// DELETE /api/workshops/:id
router.delete("/:id", ...adminOrLogistics, async (req, res, next) => {
  try {
    const w = await db.workshop.findUnique({ where: { id: req.params.id } });
    if (!w) throw new NotFoundError("Workshop not found");
    await db.workshop.delete({ where: { id: w.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
