import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { authenticate, requireRole } from "../middleware/auth";
import { ForbiddenError } from "../utils/errors";

const router = Router();

const EvalSchema = z.object({
  teamId: z.string().uuid(),
  reportType: z.enum(["intermediaire", "final"]),
  problemNumber: z.number().int().min(1),
  globalRemark: z.string().optional(),
  grades: z.array(z.object({
    criterionId: z.string().uuid(),
    score: z.number(),
    remark: z.string().optional(),
  })).optional(),
});

// GET /api/report-evaluations?teamId=
router.get("/", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    const { teamId } = req.query as Record<string, string | undefined>;

    const where = user.role === "jury"
      ? { juryMemberId: user.id }
      : teamId ? { teamId } : {};

    res.json(await db.reportEvaluation.findMany({ where, include: { grades: true } }));
  } catch (err) { next(err); }
});

// POST /api/report-evaluations
router.post("/", authenticate, requireRole("jury"), async (req, res, next) => {
  try {
    const user = req.user!;
    const { grades, ...evalData } = EvalSchema.parse(req.body);

    const assignment = await db.juryAssignment.findFirst({
      where: { juryMemberId: user.id, teamId: evalData.teamId, reportType: evalData.reportType },
    });
    if (!assignment) throw new ForbiddenError("Not assigned to grade this team/report");

    const evaluation = await db.reportEvaluation.upsert({
      where: {
        juryMemberId_teamId_reportType_problemNumber: {
          juryMemberId: user.id,
          teamId: evalData.teamId,
          reportType: evalData.reportType,
          problemNumber: evalData.problemNumber,
        },
      },
      create: { ...evalData, juryMemberId: user.id },
      update: { globalRemark: evalData.globalRemark },
    });

    if (grades?.length) {
      await db.$transaction(
        grades.map((g) =>
          db.reportGrade.upsert({
            where: { reportEvaluationId_criterionId: { reportEvaluationId: evaluation.id, criterionId: g.criterionId } },
            create: { reportEvaluationId: evaluation.id, ...g },
            update: { score: g.score, remark: g.remark },
          }),
        ),
      );
    }

    res.json(await db.reportEvaluation.findUnique({ where: { id: evaluation.id }, include: { grades: true } }));
  } catch (err) { next(err); }
});

export default router;
