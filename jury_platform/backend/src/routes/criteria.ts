import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly, authenticate } from "../middleware/auth";
import { ConflictError, NotFoundError } from "../utils/errors";

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
router.get("/", authenticate, async (_req, res, next) => {
  try {
    res.json(await db.criterion.findMany({ orderBy: [{ type: "asc" }, { order: "asc" }] }));
  } catch (err) { next(err); }
});

// POST /api/criteria
router.post("/", ...adminOnly, async (req, res, next) => {
  try {
    res.status(201).json(await db.criterion.create({ data: CriterionSchema.parse(req.body) }));
  } catch (err) { next(err); }
});

// PUT /api/criteria/:id — the patch is validated merged with the current row
router.put("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const { id, ...current } = await findOrThrow(req.params.id);
    const data = CriterionSchema.parse({ ...current, ...req.body });
    res.json(await db.criterion.update({ where: { id }, data }));
  } catch (err) { next(err); }
});

// DELETE /api/criteria/:id — refused once grades use it
router.delete("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const { id } = await findOrThrow(req.params.id);
    const [report, oral] = await Promise.all([
      db.reportGrade.count({ where: { criterionId: id } }),
      db.oralGrade.count({ where: { criterionId: id } }),
    ]);
    if (report + oral > 0) throw new ConflictError("Des notes utilisent déjà ce critère");
    await db.criterion.delete({ where: { id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

async function findOrThrow(id: string) {
  const criterion = await db.criterion.findUnique({ where: { id } });
  if (!criterion) throw new NotFoundError("Criterion not found");
  return criterion;
}

export default router;
