import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { planDuoAssignment } from "../algorithms/duoAssignment";
import { adminOnly } from "../middleware/auth";
import { audit, dayName } from "../services/audit";
import {
  duoInclude, duoPassageWarnings, duoProblemFor, gradedPassageIds, isDuoGraded, jurorDateWarnings, toDuoResponse,
} from "../services/duos";
import { asyncRoute, BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

// Jury duos of a center day — two jurors who judge together all day.
const router = Router();
router.use(...adminOnly);

const MembersSchema = z
  .array(z.string().uuid())
  .length(2, "Un duo compte exactement deux jurés")
  .refine((ids) => ids[0] !== ids[1], "Choisissez deux jurés différents");

// The duo's problem: its jurors specialize in it (passage and report
// assignment). A juror has one specialty at most (duoProblemFor).
const ProblemSchema = z.number().int().min(1).max(4).nullable();
const problemLabel = (n: number | null) => (n ? `problème ${n}` : "sans problème");

async function assertJurors(accountIds: string[], centerDayId: string, exceptDuoId?: string) {
  const jurors = await db.account.count({ where: { id: { in: accountIds }, role: "jury" } });
  if (jurors !== accountIds.length) throw new BadRequestError("Seuls des comptes jury peuvent former un duo");

  // A duo is a duo for the whole day: one duo per juror per day.
  const taken = await db.duoMember.findFirst({
    where: {
      accountId: { in: accountIds },
      duo: { centerDayId, ...(exceptDuoId ? { id: { not: exceptDuoId } } : {}) },
    },
    include: { account: true, duo: true },
  });
  if (taken) {
    throw new ConflictError(`${taken.account.firstName} ${taken.account.lastName} est déjà dans le Duo ${taken.duo.number} ce jour-là`);
  }
}

async function findDuoOrThrow(id: string) {
  const duo = await db.juryDuo.findUnique({ where: { id }, include: { ...duoInclude, centerDay: true } });
  if (!duo) throw new NotFoundError("Duo not found");
  return duo;
}

// "Ines Uitest et Karim Uitest"
async function jurorNames(accountIds: string[]): Promise<string> {
  const accounts = await db.account.findMany({ where: { id: { in: accountIds } }, orderBy: { lastName: "asc" } });
  return accounts.map((a) => `${a.firstName} ${a.lastName}`).join(" et ");
}

// GET /api/duos?centerDayId=
router.get("/", asyncRoute(async (req, res) => {
  const centerDayId = z.string().uuid().optional().parse(req.query.centerDayId);
  const duos = await db.juryDuo.findMany({
    where: centerDayId ? { centerDayId } : {},
    include: duoInclude,
    orderBy: [{ centerDayId: "asc" }, { number: "asc" }],
  });
  res.json(duos.map(toDuoResponse));
}));

// POST /api/duos — { centerDayId, accountIds: [a, b], problemNumber? } -> { duo, warnings }
// Without a problem, the duo takes its jurors' specialty, if they have one.
router.post("/", asyncRoute(async (req, res) => {
  const body = z.object({
    centerDayId: z.string().uuid(),
    accountIds: MembersSchema,
    problemNumber: ProblemSchema.optional(),
  }).parse(req.body);
  const { centerDayId, accountIds } = body;

  const day = await db.centerDay.findUnique({ where: { id: centerDayId }, include: { duos: true } });
  if (!day) throw new NotFoundError("Center day not found");
  await assertJurors(accountIds, day.id);
  const problemNumber = await duoProblemFor(accountIds, body.problemNumber ?? undefined);

  // Lowest free number, so deleting "Duo 2" lets the next duo take it back.
  const used = new Set(day.duos.map((d) => d.number));
  let number = 1;
  while (used.has(number)) number++;

  const names = await jurorNames(accountIds);
  const duo = await db.$transaction(async (tx) => {
    const created = await tx.juryDuo.create({
      data: { centerDayId: day.id, number, problemNumber, members: { create: accountIds.map((accountId) => ({ accountId })) } },
      include: duoInclude,
    });
    await audit(tx, req.user!, {
      category: "Duos",
      action: "duo.create",
      summary: `Duo ${number} formé pour ${dayName(day)} : ${names}, ${problemLabel(problemNumber)}`,
    });
    return created;
  });
  res.status(201).json({ duo: toDuoResponse(duo), warnings: await jurorDateWarnings(accountIds, day.id) });
}));

// POST /api/duos/auto-assign — { centerDayId, mode }: spreads the day's
// passages between the duos already formed by hand, evenly and, between
// equally loaded duos, to the specialists of each passage's problem (the
// plan comes from algorithms/duoAssignment.ts). "fill" keeps the duos
// already placed, "replace" recomputes the day; a graded passage always
// keeps its duo.
router.post("/auto-assign", asyncRoute(async (req, res) => {
  const { centerDayId, mode } = z.object({
    centerDayId: z.string().uuid(),
    mode: z.enum(["fill", "replace"]),
  }).parse(req.body);

  const day = await db.centerDay.findUnique({ where: { id: centerDayId } });
  if (!day) throw new NotFoundError("Center day not found");
  const [pools, duos] = await Promise.all([
    db.pool.findMany({ where: { centerDayId: day.id }, include: { passages: { include: { duo: true } } } }),
    db.juryDuo.findMany({ where: { centerDayId: day.id } }),
  ]);
  if (duos.length === 0) throw new BadRequestError("Formez d'abord au moins un duo");

  const passages = pools.flatMap((p) => p.passages);
  const graded = await gradedPassageIds(passages.map((p) => p.id));
  const plan = planDuoAssignment(
    pools.map((pool) => ({
      id: pool.id,
      label: pool.label,
      passages: pool.passages.map((p) => ({ id: p.id, slot: p.slot, problemNumber: p.problemNumber, duoId: p.duoId, locked: graded.has(p.id) })),
    })),
    duos.map((d) => ({ id: d.id, number: d.number, problemNumber: d.problemNumber })),
    mode,
  );

  const byId = new Map(passages.map((p) => [p.id, p]));
  const numberOf = new Map(duos.map((d) => [d.id, d.number]));
  const { changes } = plan;
  await db.$transaction(async (tx) => {
    for (const c of changes) {
      await tx.passage.update({ where: { id: c.passageId }, data: { duoId: c.duoId } });
    }
    if (changes.length > 0) {
      await audit(tx, req.user!, {
        category: "Duos",
        action: "passages.duo.auto",
        summary: `Attribution automatique des duos · ${dayName(day)} : ${changes.length} passage${changes.length > 1 ? "s" : ""} modifié${changes.length > 1 ? "s" : ""}`,
        details: {
          passages: changes.map((c) => ({
            passage: byId.get(c.passageId)!.label,
            avant: byId.get(c.passageId)!.duo ? `Duo ${byId.get(c.passageId)!.duo!.number}` : "sans duo",
            après: c.duoId ? `Duo ${numberOf.get(c.duoId)}` : "sans duo",
          })),
        },
      });
    }
  });

  const warnings = (await Promise.all(duos.map((d) => duoPassageWarnings(d.id)))).flat();
  res.json({
    changed: changes.length,
    assigned: plan.assigned,
    withoutDuo: plan.withoutDuo,
    samePool: plan.samePool,
    specialized: plan.specialized,
    warnings,
  });
}));

// PUT /api/duos/:id — { accountIds?: [a, b], problemNumber?: n | null } -> { duo, warnings }
// The problem only steers the automatic assignments, so it can change at
// any time — within the jurors' specialty (duoProblemFor). New jurors bring
// their specialty to a duo without a problem. Taking the problem away is
// always allowed: it's how duos formed before the one-specialty rule get
// untangled.
router.put("/:id", asyncRoute(async (req, res) => {
  const { accountIds, problemNumber } = z.object({
    accountIds: MembersSchema.optional(),
    problemNumber: ProblemSchema.optional(),
  }).parse(req.body);
  const duo = await findDuoOrThrow(req.params.id);
  const current = duo.members.map((m) => m.account.id);
  const membersChange = accountIds !== undefined && [...current].sort().join() !== [...accountIds].sort().join();

  if (membersChange) {
    if (await isDuoGraded(duo.id)) {
      throw new ConflictError(`Le Duo ${duo.number} a déjà noté des passages — ses jurés ne peuvent plus changer`);
    }
    await assertJurors(accountIds, duo.centerDayId, duo.id);
  }
  const problem =
    problemNumber === null && !membersChange ? null
    : problemNumber !== undefined || membersChange ? await duoProblemFor(accountIds ?? current, problemNumber ?? duo.problemNumber ?? undefined, duo.id)
    : duo.problemNumber;

  const names = membersChange ? [await jurorNames(current), await jurorNames(accountIds)] : null;
  await db.$transaction(async (tx) => {
    if (membersChange && names) {
      const [before, after] = names;
      await tx.duoMember.deleteMany({ where: { duoId: duo.id } });
      await tx.duoMember.createMany({ data: accountIds.map((accountId) => ({ duoId: duo.id, accountId })) });
      await audit(tx, req.user!, {
        category: "Duos",
        action: "duo.update",
        summary: `Duo ${duo.number} de ${dayName(duo.centerDay)} : ${after} (avant : ${before})`,
        details: { before: { jurés: before }, after: { jurés: after } },
      });
    }
    if (problem !== duo.problemNumber) {
      await tx.juryDuo.update({ where: { id: duo.id }, data: { problemNumber: problem } });
      await audit(tx, req.user!, {
        category: "Duos",
        action: "duo.problem",
        summary: `Duo ${duo.number} de ${dayName(duo.centerDay)} : ${problemLabel(problem)} (avant : ${problemLabel(duo.problemNumber)})`,
        details: { before: { problème: duo.problemNumber }, after: { problème: problem } },
      });
    }
  });

  const updated = await db.juryDuo.findUniqueOrThrow({ where: { id: duo.id }, include: duoInclude });
  res.json({ duo: toDuoResponse(updated), warnings: accountIds ? await jurorDateWarnings(accountIds, duo.centerDayId) : [] });
}));

// DELETE /api/duos/:id — its passages go back to "no duo"
router.delete("/:id", asyncRoute(async (req, res) => {
  const duo = await findDuoOrThrow(req.params.id);
  if (await isDuoGraded(duo.id)) {
    throw new ConflictError(`Le Duo ${duo.number} a déjà noté des passages — il ne peut plus être supprimé`);
  }
  const names = await jurorNames(duo.members.map((m) => m.account.id));
  await db.$transaction(async (tx) => {
    await tx.juryDuo.delete({ where: { id: duo.id } });
    await audit(tx, req.user!, { category: "Duos", action: "duo.delete", summary: `Duo ${duo.number} de ${dayName(duo.centerDay)} supprimé (${names})` });
  });
  res.status(204).send();
}));

export default router;
