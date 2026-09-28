import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly } from "../middleware/auth";
import { audit } from "../services/audit";
import { publicAccountSelect } from "../types";
import { generatePassword, hashPassword } from "../utils/passwords";
import { asyncRoute, BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

const router = Router();
router.use(...adminOnly);

const AccountSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  role: z.enum(["admin", "jury"]),
  isJuror: z.boolean().optional(), // an admin who also judges; a jury account always does
});

// A juror sitting in a duo or with reports to correct can't stop judging
// (lose its juror status, or be deleted) before being taken out of them
async function judgingBlocker(accountId: string): Promise<string | null> {
  const account = await db.account.findUnique({
    where: { id: accountId },
    select: { _count: { select: { duoSeats: true, reportAssignments: true } } },
  });
  if (account && account._count.duoSeats > 0) return "Ce juré fait partie d'un duo — retirez-le d'abord de son duo";
  if (account && account._count.reportAssignments > 0) {
    return "Ce juré a des rapports à corriger — retirez-les d'abord dans Affectation des rapports";
  }
  return null;
}

const showValue = (v: string | boolean | null) => (typeof v === "boolean" ? (v ? "oui" : "non") : v);

// GET /api/accounts?role=jury
router.get("/", asyncRoute(async (req, res) => {
  const role = z.enum(["admin", "jury"]).optional().parse(req.query.role);
  res.json(await db.account.findMany({
    where: role ? { role } : {},
    select: publicAccountSelect,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  }));
}));

// POST /api/accounts -> { account, password }. The generated password is
// only ever returned here (and by reset-password) — it isn't stored.
router.post("/", asyncRoute(async (req, res) => {
  const data = AccountSchema.parse(req.body);
  const isJuror = data.role === "jury" || (data.isJuror ?? false);
  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  const account = await db.$transaction(async (tx) => {
    const created = await tx.account.create({ data: { ...data, isJuror, passwordHash }, select: publicAccountSelect });
    const kind = created.role === "admin" && created.isJuror ? "admin (aussi juré)" : created.role;
    await audit(tx, req.user!, {
      category: "Comptes",
      action: "account.create",
      summary: `Compte ${kind} créé : ${created.firstName} ${created.lastName} (${created.email})`,
    });
    return created;
  });
  res.status(201).json({ account, password });
}));

// PUT /api/accounts/:id
router.put("/:id", asyncRoute(async (req, res) => {
  const data = AccountSchema.partial().parse(req.body);
  if (req.params.id === req.user!.id && data.role && data.role !== "admin") {
    throw new BadRequestError("Vous ne pouvez pas retirer votre propre rôle admin");
  }
  const before = await db.account.findUnique({ where: { id: req.params.id }, select: publicAccountSelect });
  if (!before) throw new NotFoundError("Account not found");
  // A jury account always judges; an admin keeps its status unless told
  const isJuror = (data.role ?? before.role) === "jury" || (data.isJuror ?? before.isJuror);
  if (before.isJuror && !isJuror) {
    const blocker = await judgingBlocker(before.id);
    if (blocker) throw new ConflictError(blocker);
  }
  const updated = await db.$transaction(async (tx) => {
    const after = await tx.account.update({ where: { id: before.id }, data: { ...data, isJuror }, select: publicAccountSelect });
    const fields = { firstName: "prénom", lastName: "nom", email: "email", phone: "téléphone", role: "rôle", isJuror: "juré" } as const;
    const changed = (Object.keys(fields) as (keyof typeof fields)[]).filter((k) => (before[k] ?? null) !== (after[k] ?? null));
    if (changed.length) {
      await audit(tx, req.user!, {
        category: "Comptes",
        action: "account.update",
        summary: `Compte de ${after.firstName} ${after.lastName} modifié : ${changed.map((k) => fields[k]).join(", ")}`,
        details: {
          before: Object.fromEntries(changed.map((k) => [fields[k], showValue(before[k])])),
          after: Object.fromEntries(changed.map((k) => [fields[k], showValue(after[k])])),
        },
      });
    }
    return after;
  });
  res.json(updated);
}));

// POST /api/accounts/:id/reset-password -> { password }
router.post("/:id/reset-password", asyncRoute(async (req, res) => {
  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    const account = await tx.account.update({ where: { id: req.params.id }, data: { passwordHash } });
    // The password itself is never written to the journal.
    await audit(tx, req.user!, {
      category: "Comptes",
      action: "account.reset-password",
      summary: `Nouveau mot de passe généré pour ${account.firstName} ${account.lastName}`,
    });
  });
  res.json({ password });
}));

// DELETE /api/accounts/:id — refused (409) while the account has evaluations,
// sits in a duo or has reports to correct
router.delete("/:id", asyncRoute(async (req, res) => {
  if (req.params.id === req.user!.id) {
    throw new BadRequestError("Vous ne pouvez pas supprimer votre propre compte");
  }
  const account = await db.account.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { reportEvaluations: true, oralEvaluations: true } } },
  });
  if (!account) throw new NotFoundError("Account not found");
  if (account._count.reportEvaluations + account._count.oralEvaluations > 0) {
    throw new ConflictError("Ce juré a déjà saisi des notes — son compte ne peut pas être supprimé");
  }
  const blocker = await judgingBlocker(account.id);
  if (blocker) throw new ConflictError(blocker);
  await db.$transaction(async (tx) => {
    await tx.account.delete({ where: { id: account.id } });
    await audit(tx, req.user!, {
      category: "Comptes",
      action: "account.delete",
      summary: `Compte supprimé : ${account.firstName} ${account.lastName} (${account.email})`,
    });
  });
  res.status(204).send();
}));

export default router;
