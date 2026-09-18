import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly } from "../middleware/auth";
import { publicAccountSelect } from "../types";
import { generatePassword, hashPassword } from "../utils/passwords";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

const router = Router();
router.use(...adminOnly);

const AccountSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  role: z.enum(["admin", "jury"]),
});

// GET /api/accounts?role=jury
router.get("/", async (req, res, next) => {
  try {
    const role = z.enum(["admin", "jury"]).optional().parse(req.query.role);
    res.json(await db.account.findMany({
      where: role ? { role } : {},
      select: publicAccountSelect,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }));
  } catch (err) { next(err); }
});

// POST /api/accounts -> { account, password }. The generated password is
// only ever returned here (and by reset-password) — it isn't stored.
router.post("/", async (req, res, next) => {
  try {
    const data = AccountSchema.parse(req.body);
    const password = generatePassword();
    const account = await db.account.create({
      data: { ...data, passwordHash: await hashPassword(password) },
      select: publicAccountSelect,
    });
    res.status(201).json({ account, password });
  } catch (err) { next(err); }
});

// PUT /api/accounts/:id
router.put("/:id", async (req, res, next) => {
  try {
    const data = AccountSchema.partial().parse(req.body);
    if (req.params.id === req.user!.id && data.role && data.role !== "admin") {
      throw new BadRequestError("Vous ne pouvez pas retirer votre propre rôle admin");
    }
    res.json(await db.account.update({
      where: { id: req.params.id },
      data,
      select: publicAccountSelect,
    }));
  } catch (err) { next(err); }
});

// POST /api/accounts/:id/reset-password -> { password }
router.post("/:id/reset-password", async (req, res, next) => {
  try {
    const password = generatePassword();
    await db.account.update({
      where: { id: req.params.id },
      data: { passwordHash: await hashPassword(password) },
    });
    res.json({ password });
  } catch (err) { next(err); }
});

// DELETE /api/accounts/:id — refused (409) while the account has evaluations
// or sits in a duo
router.delete("/:id", async (req, res, next) => {
  try {
    if (req.params.id === req.user!.id) {
      throw new BadRequestError("Vous ne pouvez pas supprimer votre propre compte");
    }
    const account = await db.account.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { reportEvaluations: true, oralEvaluations: true, duoSeats: true } } },
    });
    if (!account) throw new NotFoundError("Account not found");
    if (account._count.reportEvaluations + account._count.oralEvaluations > 0) {
      throw new ConflictError("Ce juré a déjà saisi des notes — son compte ne peut pas être supprimé");
    }
    if (account._count.duoSeats > 0) {
      throw new ConflictError("Ce juré fait partie d'un duo — retirez-le d'abord de son duo");
    }
    await db.account.delete({ where: { id: account.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
