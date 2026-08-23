import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { authenticate, requireRole } from "../middleware/auth";
import { ForbiddenError } from "../utils/errors";

const router = Router();

const EvalSchema = z.object({
  passageId: z.string().uuid(),
  teamId: z.string().uuid(),
  role: z.enum(["defender", "opponent", "reporter", "extra"]),
  globalRemark: z.string().optional(),
  grades: z.array(z.object({
    criterionId: z.string().uuid(),
    score: z.number(),
    remark: z.string().optional(),
  })).optional(),
});

// GET /api/oral-evaluations?passageId=
router.get("/", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    const { passageId } = req.query as Record<string, string | undefined>;

    const where = user.role === "jury"
      ? { juryMemberId: user.id, ...(passageId ? { passageId } : {}) }
      : passageId ? { passageId } : {};

    res.json(await db.oralEvaluation.findMany({ where, include: { grades: true } }));
  } catch (err) { next(err); }
});

// POST /api/oral-evaluations
router.post("/", authenticate, requireRole("jury"), async (req, res, next) => {
  try {
    const user = req.user!;
    const { grades, ...evalData } = EvalSchema.parse(req.body);

    const assignment = await db.juryPassageAssignment.findFirst({
      where: { juryMemberId: user.id, passageId: evalData.passageId },
    });
    if (!assignment) throw new ForbiddenError("Not assigned to this passage");

    const evaluation = await db.oralEvaluation.upsert({
      where: {
        juryMemberId_passageId_teamId: {
          juryMemberId: user.id,
          passageId: evalData.passageId,
          teamId: evalData.teamId,
        },
      },
      create: { ...evalData, juryMemberId: user.id },
      update: { globalRemark: evalData.globalRemark, role: evalData.role },
    });

    if (grades?.length) {
      await db.$transaction(
        grades.map((g) =>
          db.oralGrade.upsert({
            where: { oralEvaluationId_criterionId: { oralEvaluationId: evaluation.id, criterionId: g.criterionId } },
            create: { oralEvaluationId: evaluation.id, ...g },
            update: { score: g.score, remark: g.remark },
          }),
        ),
      );
    }

    res.json(await db.oralEvaluation.findUnique({ where: { id: evaluation.id }, include: { grades: true } }));
  } catch (err) { next(err); }
});

export default router;
