import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { authenticate, requireRole } from "../middleware/auth";
import { isPoolJuror } from "../services/access";
import { GradesSchema, assertCriteriaApply } from "../services/grading";
import { roleOf } from "../services/passages";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors";

const router = Router();

// The role is not sent by the client — it's read off the passage lineup.
const EvalSchema = z.object({
  passageId: z.string().uuid(),
  teamId: z.string().uuid(),
  globalRemark: z.string().optional(),
  grades: GradesSchema,
});

// GET /api/oral-evaluations?passageId= — jury: their own; admin: all
router.get("/", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    const passageId = z.string().uuid().optional().parse(req.query.passageId);
    res.json(await db.oralEvaluation.findMany({
      where: {
        ...(passageId ? { passageId } : {}),
        ...(user.role === "jury" ? { juryId: user.id } : {}),
      },
      include: { grades: true },
    }));
  } catch (err) { next(err); }
});

// POST /api/oral-evaluations — upsert the juror's evaluation of one team
// in one passage, with its grades
router.post("/", authenticate, requireRole("jury"), async (req, res, next) => {
  try {
    const user = req.user!;
    const { grades = [], ...evalData } = EvalSchema.parse(req.body);

    const passage = await db.passage.findUnique({ where: { id: evalData.passageId } });
    if (!passage) throw new NotFoundError("Passage not found");
    if (!(await isPoolJuror(user.id, passage.poolId))) {
      throw new ForbiddenError("Vous n'êtes pas juré de cette poule");
    }

    const role = roleOf(passage, evalData.teamId);
    if (!role) throw new BadRequestError("Cette équipe ne joue pas dans ce passage");
    if (role === "extra") throw new BadRequestError("L'observateur n'est pas noté");

    const evaluation = await db.$transaction(async (tx) => {
      await assertCriteriaApply(tx, grades.map((g) => g.criterionId), { type: "oral", role });

      const saved = await tx.oralEvaluation.upsert({
        where: {
          juryId_passageId_teamId: { juryId: user.id, passageId: passage.id, teamId: evalData.teamId },
        },
        create: { ...evalData, role, juryId: user.id },
        update: { globalRemark: evalData.globalRemark, role },
      });
      for (const g of grades) {
        await tx.oralGrade.upsert({
          where: { oralEvaluationId_criterionId: { oralEvaluationId: saved.id, criterionId: g.criterionId } },
          create: { oralEvaluationId: saved.id, ...g },
          update: { score: g.score, remark: g.remark },
        });
      }
      return tx.oralEvaluation.findUniqueOrThrow({ where: { id: saved.id }, include: { grades: true } });
    });

    res.json(evaluation);
  } catch (err) { next(err); }
});

export default router;
