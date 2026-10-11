import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly, authenticate, jurorOnly } from "../middleware/auth";
import { isPassageJuror, ownGradesOnly } from "../services/access";
import { audit } from "../services/audit";
import { GradesSchema, NoteEditSchema, assertCriteriaApply, frNumber, noteDetails, noteOf } from "../services/grading";
import { roleOf } from "../services/passages";
import { asyncRoute, BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors";

const router = Router();

// The role is not sent by the client — it's read off the passage lineup.
const EvalSchema = z.object({
  passageId: z.string().uuid(),
  teamId: z.string().uuid(),
  globalRemark: z.string().optional(),
  grades: GradesSchema,
});

// GET /api/oral-evaluations?passageId=&mine=1 — jury: their own; admin: all,
// or their own with mine=1 (an admin who also judges, on its juror pages)
router.get("/", authenticate, asyncRoute(async (req, res) => {
  const user = req.user!;
  const passageId = z.string().uuid().optional().parse(req.query.passageId);
  res.json(await db.oralEvaluation.findMany({
    where: {
      ...(passageId ? { passageId } : {}),
      ...(ownGradesOnly(user, req.query.mine) ? { juryId: user.id } : {}),
    },
    include: { grades: true },
  }));
}));

// POST /api/oral-evaluations — upsert the juror's evaluation of one team
// in one passage, with its grades
router.post("/", ...jurorOnly, asyncRoute(async (req, res) => {
  const user = req.user!;
  const { grades = [], ...evalData } = EvalSchema.parse(req.body);

  const passage = await db.passage.findUnique({ where: { id: evalData.passageId } });
  if (!passage) throw new NotFoundError("Passage not found");
  if (!(await isPassageJuror(user.id, passage.id))) {
    throw new ForbiddenError("Votre duo ne juge pas ce passage");
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
}));

// ─── An admin corrects or removes a juror's note ──────────────────────
// Whatever the note was goes to the journal, criterion by criterion.

const ROLE_NAMES: Record<string, string> = { defender: "défenseur", opponent: "opposant", reporter: "rapporteur" };

// The note with what the journal says about it: its juror, team, passage and grid
async function findNoteOrThrow(id: string) {
  const evaluation = await db.oralEvaluation.findUnique({
    where: { id: z.string().uuid().parse(id) },
    include: { grades: true, jury: { select: { firstName: true, lastName: true } }, passage: { select: { label: true } } },
  });
  if (!evaluation) throw new NotFoundError("Note introuvable");
  const [team, criteria] = await Promise.all([
    db.team.findUnique({ where: { id: evaluation.teamId }, select: { quadrigram: true } }),
    db.criterion.findMany({ where: { type: "oral", role: evaluation.role }, orderBy: { order: "asc" } }),
  ]);
  const juror = `${evaluation.jury.firstName} ${evaluation.jury.lastName}`;
  const subject = `${team?.quadrigram ?? "?"} ${ROLE_NAMES[evaluation.role] ?? evaluation.role} dans ${evaluation.passage.label}`;
  return { evaluation, criteria, juror, subject };
}

// PUT /api/oral-evaluations/:id — { globalRemark, grades }: the note as the
// admin corrects it (the whole grid; an empty remark clears it)
router.put("/:id", ...adminOnly, asyncRoute(async (req, res) => {
  const { grades = [], globalRemark } = NoteEditSchema.parse(req.body);
  const { evaluation, criteria, juror, subject } = await findNoteOrThrow(req.params.id);

  const updated = await db.$transaction(async (tx) => {
    await assertCriteriaApply(tx, grades.map((g) => g.criterionId), { type: "oral", role: evaluation.role });
    await tx.oralEvaluation.update({ where: { id: evaluation.id }, data: { globalRemark: globalRemark?.trim() || null } });
    for (const g of grades) {
      await tx.oralGrade.upsert({
        where: { oralEvaluationId_criterionId: { oralEvaluationId: evaluation.id, criterionId: g.criterionId } },
        create: { oralEvaluationId: evaluation.id, criterionId: g.criterionId, score: g.score, remark: g.remark?.trim() || null },
        update: { score: g.score, remark: g.remark?.trim() || null },
      });
    }
    const saved = await tx.oralEvaluation.findUniqueOrThrow({ where: { id: evaluation.id }, include: { grades: true } });
    const [before, after] = [noteOf(evaluation.grades, criteria), noteOf(saved.grades, criteria)];
    await audit(tx, req.user!, {
      category: "Notes",
      action: "oral.update",
      summary: `Note d'oral de ${juror} modifiée : ${subject}, ${frNumber(before.total)} devient ${frNumber(after.total)} sur ${frNumber(after.max)}`,
      details: { avant: noteDetails(evaluation, criteria), après: noteDetails(saved, criteria) },
    });
    return saved;
  });
  res.json(updated);
}));

// DELETE /api/oral-evaluations/:id — the note is gone: the juror may grade again
router.delete("/:id", ...adminOnly, asyncRoute(async (req, res) => {
  const { evaluation, criteria, juror, subject } = await findNoteOrThrow(req.params.id);
  const { total, max } = noteOf(evaluation.grades, criteria);
  await db.$transaction(async (tx) => {
    await tx.oralEvaluation.delete({ where: { id: evaluation.id } });
    await audit(tx, req.user!, {
      category: "Notes",
      action: "oral.delete",
      summary: `Note d'oral de ${juror} supprimée : ${subject} (${frNumber(total)} sur ${frNumber(max)})`,
      details: { supprimée: noteDetails(evaluation, criteria) },
    });
  });
  res.status(204).send();
}));

export default router;
