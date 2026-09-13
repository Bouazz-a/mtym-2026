import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { authenticate, requireRole, requireOrganizerRole } from "../middleware/auth";
import { NotFoundError, BadRequestError } from "../utils/errors";

const router = Router();

const Schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(["admin", "logistics", "scientific"]),
});

// All organizer management is admin-only
const adminOnly = [authenticate, requireRole("organizer"), requireOrganizerRole("admin")];

router.get("/", ...adminOnly, async (_req, res, next) => {
  try {
    res.json(await db.organizer.findMany());
  } catch (err) { next(err); }
});

router.get("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const o = await db.organizer.findUnique({ where: { id: req.params.id } });
    if (!o) throw new NotFoundError("Organizer not found");
    res.json(o);
  } catch (err) { next(err); }
});

router.post("/", ...adminOnly, async (req, res, next) => {
  try {
    const data = Schema.parse(req.body);
    const existing = await db.organizer.findUnique({ where: { email: data.email } });
    if (existing) throw new BadRequestError("Email already registered");
    res.status(201).json(await db.organizer.create({ data }));
  } catch (err) { next(err); }
});

router.put("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const o = await db.organizer.findUnique({ where: { id: req.params.id } });
    if (!o) throw new NotFoundError("Organizer not found");
    const data = Schema.partial().parse(req.body);
    res.json(await db.organizer.update({ where: { id: o.id }, data }));
  } catch (err) { next(err); }
});

router.delete("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const o = await db.organizer.findUnique({ where: { id: req.params.id } });
    if (!o) throw new NotFoundError("Organizer not found");
    await db.organizer.delete({ where: { id: o.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
