import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly, authenticate, jurorOnly } from "../middleware/auth";
import { juryCanAccessReport, ownGradesOnly } from "../services/access";
import { audit } from "../services/audit";
import { GradesSchema, NoteEditSchema, assertCriteriaApply, frNumber, noteDetails, noteOf } from "../services/grading";
import { asyncRoute, ForbiddenError, NotFoundError } from "../utils/errors";

const router = Router();

// Final report of the problem a team defends, graded by the duo judging
// the passage where it defends.
const EvalSchema = z.object({
  teamId: z.string().uuid(),
  problemNumber: z.number().int().min(1).max(4),
  globalRemark: z.string().optional(),
  grades: GradesSchema,
});

// GET /api/report-evaluations?teamId=&mine=1 — jury: their own; admin: all,
// or their own with mine=1 (an admin who also judges, on its juror pages)
router.get("/", authenticate, asyncRoute(async (req, res) => {
  const user = req.user!;
  const teamId = z.string().uuid().optional().parse(req.query.teamId);
  res.json(await db.reportEvaluation.findMany({
    where: {
      ...(teamId ? { teamId } : {}),
      ...(ownGradesOnly(user, req.query.mine) ? { juryId: user.id } : {}),
    },
    include: { grades: true },
  }));
}));

// POST /api/report-evaluations — upsert the juror's evaluation and grades
router.post("/", ...jurorOnly, asyncRoute(async (req, res) => {
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
}));

// ─── An admin corrects or removes a juror's note ──────────────────────
// Whatever the note was goes to the journal, criterion by criterion.

const OUT_OF = 20; // how a written report's note is read, whatever its grid adds up to

async function findNoteOrThrow(id: string) {
  const evaluation = await db.reportEvaluation.findUnique({
    where: { id: z.string().uuid().parse(id) },
    include: { grades: true, jury: { select: { firstName: true, lastName: true } }, team: { select: { quadrigram: true } } },
  });
  if (!evaluation) throw new NotFoundError("Note introuvable");
  const criteria = await db.criterion.findMany({
    where: { type: "report", problemNumber: evaluation.problemNumber },
    orderBy: { order: "asc" },
  });
  const juror = `${evaluation.jury.firstName} ${evaluation.jury.lastName}`;
  const subject = `${evaluation.team.quadrigram} problème ${evaluation.problemNumber}`;
  return { evaluation, criteria, juror, subject };
}

// PUT /api/report-evaluations/:id — { globalRemark, grades }: the note as the
// admin corrects it (the whole grid; an empty remark clears it)
router.put("/:id", ...adminOnly, asyncRoute(async (req, res) => {
  const { grades = [], globalRemark } = NoteEditSchema.parse(req.body);
  const { evaluation, criteria, juror, subject } = await findNoteOrThrow(req.params.id);

  const updated = await db.$transaction(async (tx) => {
    await assertCriteriaApply(tx, grades.map((g) => g.criterionId), { type: "report", problemNumber: evaluation.problemNumber });
    await tx.reportEvaluation.update({ where: { id: evaluation.id }, data: { globalRemark: globalRemark?.trim() || null } });
    for (const g of grades) {
      await tx.reportGrade.upsert({
        where: { reportEvaluationId_criterionId: { reportEvaluationId: evaluation.id, criterionId: g.criterionId } },
        create: { reportEvaluationId: evaluation.id, criterionId: g.criterionId, score: g.score, remark: g.remark?.trim() || null },
        update: { score: g.score, remark: g.remark?.trim() || null },
      });
    }
    const saved = await tx.reportEvaluation.findUniqueOrThrow({ where: { id: evaluation.id }, include: { grades: true } });
    const [before, after] = [noteOf(evaluation.grades, criteria, OUT_OF), noteOf(saved.grades, criteria, OUT_OF)];
    await audit(tx, req.user!, {
      category: "Notes",
      action: "report.update",
      summary: `Note de rapport de ${juror} modifiée : ${subject}, ${frNumber(before.total)} devient ${frNumber(after.total)} sur ${frNumber(after.max)}`,
      details: { avant: noteDetails(evaluation, criteria, OUT_OF), après: noteDetails(saved, criteria, OUT_OF) },
    });
    return saved;
  });
  res.json(updated);
}));

// DELETE /api/report-evaluations/:id — the note is gone: the juror may grade again
router.delete("/:id", ...adminOnly, asyncRoute(async (req, res) => {
  const { evaluation, criteria, juror, subject } = await findNoteOrThrow(req.params.id);
  const { total, max } = noteOf(evaluation.grades, criteria, OUT_OF);
  await db.$transaction(async (tx) => {
    await tx.reportEvaluation.delete({ where: { id: evaluation.id } });
    await audit(tx, req.user!, {
      category: "Notes",
      action: "report.delete",
      summary: `Note de rapport de ${juror} supprimée : ${subject} (${frNumber(total)} sur ${frNumber(max)})`,
      details: { supprimée: noteDetails(evaluation, criteria, OUT_OF) },
    });
  });
  res.status(204).send();
}));

export default router;
