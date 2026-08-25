import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { authenticate, requireRole, requireOrganizerRole } from "../middleware/auth";
import { NotFoundError } from "../utils/errors";

const router = Router();

const adminOrScientific = [authenticate, requireRole("organizer"), requireOrganizerRole("admin", "scientific")];

const CriterionSchema = z.object({
  label: z.string().min(1),
  coefficient: z.number().positive(),
  type: z.enum(["report", "oral"]),
  role: z.enum(["defender", "opponent", "reporter", "extra"]).optional(),
  problemNumber: z.number().int().optional(),
  theme: z.string().optional(),
  order: z.number().int(),
});

// GET /api/criteria
router.get("/", authenticate, async (_req, res, next) => {
  try {
    res.json(await db.criterion.findMany({ orderBy: { order: "asc" } }));
  } catch (err) { next(err); }
});

// POST /api/criteria
router.post("/", ...adminOrScientific, async (req, res, next) => {
  try {
    res.status(201).json(await db.criterion.create({ data: CriterionSchema.parse(req.body) }));
  } catch (err) { next(err); }
});

// PUT /api/criteria/:id
router.put("/:id", ...adminOrScientific, async (req, res, next) => {
  try {
    const c = await db.criterion.findUnique({ where: { id: req.params.id } });
    if (!c) throw new NotFoundError("Criterion not found");
    res.json(await db.criterion.update({ where: { id: c.id }, data: CriterionSchema.partial().parse(req.body) }));
  } catch (err) { next(err); }
});

// DELETE /api/criteria/:id
router.delete("/:id", ...adminOrScientific, async (req, res, next) => {
  try {
    const c = await db.criterion.findUnique({ where: { id: req.params.id } });
    if (!c) throw new NotFoundError("Criterion not found");
    await db.criterion.delete({ where: { id: c.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
