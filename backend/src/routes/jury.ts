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
  city: z.string().optional(),
  region: z.string().optional(),
  transportInfo: z.enum(["train", "voiture", "bus", "autre"]).optional(),
});

const adminOnly = [authenticate, requireRole("organizer"), requireOrganizerRole("admin")];

// GET /api/jury — all authenticated users
router.get("/", authenticate, async (_req, res, next) => {
  try {
    res.json(await db.juryMember.findMany());
  } catch (err) { next(err); }
});

// GET /api/jury/loads — workload stats (admin)
router.get("/loads", ...adminOnly, async (_req, res, next) => {
  try {
    const [jurors, reportAssignments, passageAssignments] = await Promise.all([
      db.juryMember.findMany(),
      db.juryAssignment.findMany(),
      db.juryPassageAssignment.findMany(),
    ]);
    res.json(jurors.map((j) => ({
      juror: j,
      interTeams: reportAssignments.filter((a) => a.juryMemberId === j.id && a.reportType === "intermediaire").length,
      finalTeams: reportAssignments.filter((a) => a.juryMemberId === j.id && a.reportType === "final").length,
      passages: passageAssignments.filter((a) => a.juryMemberId === j.id).length,
    })));
  } catch (err) { next(err); }
});

// GET /api/jury/:id
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const j = await db.juryMember.findUnique({ where: { id: req.params.id } });
    if (!j) throw new NotFoundError("Jury member not found");
    res.json(j);
  } catch (err) { next(err); }
});

// POST /api/jury — admin only
router.post("/", ...adminOnly, async (req, res, next) => {
  try {
    const data = Schema.parse(req.body);
    const existing = await db.juryMember.findUnique({ where: { email: data.email } });
    if (existing) throw new BadRequestError("Email already registered");
    res.status(201).json(await db.juryMember.create({ data }));
  } catch (err) { next(err); }
});

// PUT /api/jury/:id — self or admin
router.put("/:id", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    const j = await db.juryMember.findUnique({ where: { id: req.params.id } });
    if (!j) throw new NotFoundError("Jury member not found");

    const isAdmin = user.role === "organizer" && user.organizerRole === "admin";
    if (!isAdmin && user.id !== j.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const data = Schema.partial().parse(req.body);
    res.json(await db.juryMember.update({ where: { id: j.id }, data }));
  } catch (err) { next(err); }
});

// DELETE /api/jury/:id — admin only
router.delete("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const j = await db.juryMember.findUnique({ where: { id: req.params.id } });
    if (!j) throw new NotFoundError("Jury member not found");
    await db.juryMember.delete({ where: { id: j.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
