import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { authenticate, requireRole } from "../middleware/auth";
import { juryCanAccessReport } from "../services/access";
import { GradesSchema, assertCriteriaApply } from "../services/grading";
import { ForbiddenError } from "../utils/errors";

const router = Router();

// Final report of the problem a team defends, graded by the duo judging
// the passage where it defends.
const EvalSchema = z.object({
  teamId: z.string().uuid(),
  problemNumber: z.number().int().min(1).max(4),
  globalRemark: z.string().optional(),
  grades: GradesSchema,
});

// GET /api/report-evaluations?teamId= — jury: their own; admin: all
router.get("/", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    const teamId = z.string().uuid().optional().parse(req.query.teamId);
    res.json(await db.reportEvaluation.findMany({
      where: {
        ...(teamId ? { teamId } : {}),
        ...(user.role === "jury" ? { juryId: user.id } : {}),
      },
      include: { grades: true },
    }));
  } catch (err) { next(err); }
});

// POST /api/report-evaluations — upsert the juror's evaluation and grades
router.post("/", authenticate, requireRole("jury"), async (req, res, next) => {
  try {
    const user = req.user!;
    const { grades = [], ...evalData } = EvalSchema.parse(req.body);

    if (!(await juryCanAccessReport(user.id, evalData.teamId, evalData.problemNumber))) {
      throw new ForbiddenError("Vous ne notez pas ce rapport");
    }

    const evaluation = await db.$transaction(async (tx) => {
      await assertCriteriaApply(tx, grades.map((g) => g.criterionId), {
        type: "report",
        problemNumber: evalData.problemNumber,
      });

      const saved = await tx.reportEvaluation.upsert({
        where: {
          juryId_teamId_problemNumber: {
            juryId: user.id,
            teamId: evalData.teamId,
            problemNumber: evalData.problemNumber,
          },
        },
        create: { ...evalData, juryId: user.id },
        update: { globalRemark: evalData.globalRemark },
      });
      for (const g of grades) {
        await tx.reportGrade.upsert({
          where: { reportEvaluationId_criterionId: { reportEvaluationId: saved.id, criterionId: g.criterionId } },
          create: { reportEvaluationId: saved.id, ...g },
          update: { score: g.score, remark: g.remark },
        });
      }
      return tx.reportEvaluation.findUniqueOrThrow({ where: { id: saved.id }, include: { grades: true } });
    });

    res.json(evaluation);
  } catch (err) { next(err); }
});

export default router;
