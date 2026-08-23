import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { authenticate, requireRole } from "../middleware/auth";
import { NotFoundError } from "../utils/errors";

const router = Router();

const anyOrganizer = [authenticate, requireRole("organizer")];

const DeadlineSchema = z.object({
  label: z.string().min(1),
  date: z.string().min(1),
  targetRole: z.enum(["all", "participants", "jury"]),
});

// GET /api/deadlines
router.get("/", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    const all = await db.deadline.findMany();
    if (user.role === "organizer") { res.json(all); return; }
    res.json(all.filter((d) =>
      d.targetRole === "all" ||
      (user.role === "participant" && d.targetRole === "participants") ||
      (user.role === "jury" && d.targetRole === "jury"),
    ));
  } catch (err) { next(err); }
});

// POST /api/deadlines
router.post("/", ...anyOrganizer, async (req, res, next) => {
  try {
    res.status(201).json(await db.deadline.create({ data: DeadlineSchema.parse(req.body) }));
  } catch (err) { next(err); }
});

// PUT /api/deadlines/:id
router.put("/:id", ...anyOrganizer, async (req, res, next) => {
  try {
    const d = await db.deadline.findUnique({ where: { id: req.params.id } });
    if (!d) throw new NotFoundError("Deadline not found");
    res.json(await db.deadline.update({ where: { id: d.id }, data: DeadlineSchema.partial().parse(req.body) }));
  } catch (err) { next(err); }
});

// DELETE /api/deadlines/:id
router.delete("/:id", ...anyOrganizer, async (req, res, next) => {
  try {
    const d = await db.deadline.findUnique({ where: { id: req.params.id } });
    if (!d) throw new NotFoundError("Deadline not found");
    await db.deadline.delete({ where: { id: d.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
