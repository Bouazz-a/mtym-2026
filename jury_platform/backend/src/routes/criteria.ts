import { Router } from "express";
import { z } from "zod";
import type { Criterion } from "@prisma/client";
import { db } from "../db";
import { adminOnly, authenticate } from "../middleware/auth";
import { audit } from "../services/audit";
import { asyncRoute, BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

const router = Router();

// A report criterion belongs to one problem's grid, an oral criterion to
// one graded role's grid (the observer isn't graded).
const CriterionSchema = z.object({
  label: z.string().trim().min(1),
  coefficient: z.number().refine((n) => n !== 0, "Le coefficient ne peut pas être nul"), // < 0 = malus
  type: z.enum(["report", "oral"]),
  role: z.enum(["defender", "opponent", "reporter"]).nullable().optional(),
  problemNumber: z.number().int().min(1).max(4).nullable().optional(),
  theme: z.string().trim().nullable().optional(),
  order: z.number().int(),
}).refine(
  (c) => (c.type === "report" ? c.problemNumber != null && c.role == null : c.role != null && c.problemNumber == null),
  { message: "Un critère de rapport a un problème, un critère d'oral a un rôle" },
);

// GET /api/criteria
router.get("/", authenticate, asyncRoute(async (_req, res) => {
  res.json(await db.criterion.findMany({ orderBy: [{ type: "asc" }, { order: "asc" }] }));
}));

// POST /api/criteria
router.post("/", ...adminOnly, asyncRoute(async (req, res) => {
  const data = CriterionSchema.parse(req.body);
  const criterion = await db.$transaction(async (tx) => {
    const created = await tx.criterion.create({ data });
    await audit(tx, req.user!, {
      category: "Critères",
      action: "criterion.create",
      summary: `Critère ajouté à la grille ${gridName(created)} : « ${created.label} » (coef. ${created.coefficient})`,
    });
    return created;
  });
  res.status(201).json(criterion);
}));

// PUT /api/criteria/:id — the patch is validated merged with the current row
router.put("/:id", ...adminOnly, asyncRoute(async (req, res) => {
  const { id, ...current } = await findOrThrow(req.params.id);
  const data = CriterionSchema.parse({ ...current, ...req.body });
  const updated = await db.$transaction(async (tx) => {
    const saved = await tx.criterion.update({ where: { id }, data });
    const fields = { label: "intitulé", coefficient: "coefficient", theme: "thème" } as const;
    const changed = (Object.keys(fields) as (keyof typeof fields)[]).filter((k) => (current[k] ?? null) !== (saved[k] ?? null));
    if (changed.length) {
      await audit(tx, req.user!, {
        category: "Critères",
        action: "criterion.update",
        summary: `Critère « ${saved.label} » (grille ${gridName(saved)}) : ${changed.map((k) => `${fields[k]} ${current[k] ?? "vide"} devient ${saved[k] ?? "vide"}`).join(", ")}`,
        details: {
          before: Object.fromEntries(changed.map((k) => [fields[k], current[k]])),
          after: Object.fromEntries(changed.map((k) => [fields[k], saved[k]])),
        },
      });
    }
    return saved;
  });
  res.json(updated);
}));

// DELETE /api/criteria/:id — refused once grades use it
router.delete("/:id", ...adminOnly, asyncRoute(async (req, res) => {
  const criterion = await findOrThrow(req.params.id);
  const { id } = criterion;
  const [report, oral] = await Promise.all([
    db.reportGrade.count({ where: { criterionId: id } }),
    db.oralGrade.count({ where: { criterionId: id } }),
  ]);
  if (report + oral > 0) throw new ConflictError("Des notes utilisent déjà ce critère");
  await db.$transaction(async (tx) => {
    await tx.criterion.delete({ where: { id } });
    await audit(tx, req.user!, {
      category: "Critères",
      action: "criterion.delete",
      summary: `Critère supprimé de la grille ${gridName(criterion)} : « ${criterion.label} »`,
    });
  });
  res.status(204).send();
}));

// POST /api/criteria/copy — { from, to }: problem `to`'s report grid becomes a
// copy of problem `from`'s, its own criteria replaced. Refused once grades
// use the grid it would replace.
router.post("/copy", ...adminOnly, asyncRoute(async (req, res) => {
  const Problem = z.number().int().min(1).max(4);
  const { from, to } = z
    .object({ from: Problem, to: Problem })
    .refine((b) => b.from !== b.to, "Choisissez un autre problème")
    .parse(req.body);

  const [source, target] = await Promise.all([
    db.criterion.findMany({ where: { type: "report", problemNumber: from }, orderBy: { order: "asc" } }),
    db.criterion.findMany({ where: { type: "report", problemNumber: to } }),
  ]);
  if (source.length === 0) throw new BadRequestError(`La grille du problème ${from} est vide : rien à copier`);
  if ((await db.reportGrade.count({ where: { criterionId: { in: target.map((c) => c.id) } } })) > 0) {
    throw new ConflictError(`Des notes utilisent déjà la grille du problème ${to} : elle ne peut plus être remplacée`);
  }

  const copied = await db.$transaction(async (tx) => {
    await tx.criterion.deleteMany({ where: { id: { in: target.map((c) => c.id) } } });
    await tx.criterion.createMany({ data: source.map(({ id: _id, ...c }) => ({ ...c, problemNumber: to })) });
    await audit(tx, req.user!, {
      category: "Critères",
      action: "criteria.copy",
      summary: `Grille du rapport problème ${to} remplacée par une copie de celle du problème ${from} : ${source.length} critère${source.length > 1 ? "s" : ""}${target.length ? ` (${target.length} supprimé${target.length > 1 ? "s" : ""})` : ""}`,
      details: { copiés: source.map((c) => `${c.label} (coef. ${c.coefficient})`), supprimés: target.map((c) => c.label) },
    });
    return tx.criterion.findMany({ where: { type: "report", problemNumber: to }, orderBy: { order: "asc" } });
  });
  res.status(201).json(copied);
}));

const ROLE_NAMES: Record<string, string> = { defender: "Défenseur", opponent: "Opposant", reporter: "Rapporteur", extra: "Observateur" };

// "oral Défenseur", "rapport problème 2"
function gridName(c: Criterion): string {
  return c.type === "oral" ? `oral ${ROLE_NAMES[c.role ?? ""] ?? "?"}` : `rapport problème ${c.problemNumber}`;
}

async function findOrThrow(id: string) {
  const criterion = await db.criterion.findUnique({ where: { id } });
  if (!criterion) throw new NotFoundError("Criterion not found");
  return criterion;
}

export default router;
