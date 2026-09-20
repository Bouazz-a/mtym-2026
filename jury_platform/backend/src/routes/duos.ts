import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly } from "../middleware/auth";
import { audit, dayName } from "../services/audit";
import { duoInclude, duoPassageWarnings, gradedPassageIds, isDuoGraded, jurorDateWarnings, toDuoResponse } from "../services/duos";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

// Jury duos of a center day — two jurors who judge together all day.
const router = Router();
router.use(...adminOnly);

const MembersSchema = z
  .array(z.string().uuid())
  .length(2, "Un duo compte exactement deux jurés")
  .refine((ids) => ids[0] !== ids[1], "Choisissez deux jurés différents");

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
router.get("/", async (req, res, next) => {
  try {
    const centerDayId = z.string().uuid().optional().parse(req.query.centerDayId);
    const duos = await db.juryDuo.findMany({
      where: centerDayId ? { centerDayId } : {},
      include: duoInclude,
      orderBy: [{ centerDayId: "asc" }, { number: "asc" }],
    });
    res.json(duos.map(toDuoResponse));
  } catch (err) { next(err); }
});

// POST /api/duos — { centerDayId, accountIds: [a, b] } -> { duo, warnings }
router.post("/", async (req, res, next) => {
  try {
    const { centerDayId, accountIds } = z.object({
      centerDayId: z.string().uuid(),
      accountIds: MembersSchema,
    }).parse(req.body);

    const day = await db.centerDay.findUnique({ where: { id: centerDayId }, include: { duos: true } });
    if (!day) throw new NotFoundError("Center day not found");
    await assertJurors(accountIds, day.id);

    // Lowest free number, so deleting "Duo 2" lets the next duo take it back.
    const used = new Set(day.duos.map((d) => d.number));
    let number = 1;
    while (used.has(number)) number++;

    const names = await jurorNames(accountIds);
    const duo = await db.$transaction(async (tx) => {
      const created = await tx.juryDuo.create({
        data: { centerDayId: day.id, number, members: { create: accountIds.map((accountId) => ({ accountId })) } },
        include: duoInclude,
      });
      await audit(tx, req.user!, { category: "Duos", action: "duo.create", summary: `Duo ${number} formé pour ${dayName(day)} : ${names}` });
      return created;
    });
    res.status(201).json({ duo: toDuoResponse(duo), warnings: await jurorDateWarnings(accountIds, day.id) });
  } catch (err) { next(err); }
});

// PUT /api/duos/assignments — several passages at once, from the admin UI's
// automatic assignment (the duos themselves are always formed by hand).
// Body: { centerDayId, assignments: [{ passageId, duoId | null }] }.
router.put("/assignments", async (req, res, next) => {
  try {
    const { centerDayId, assignments } = z.object({
      centerDayId: z.string().uuid(),
      assignments: z.array(z.object({
        passageId: z.string().uuid(),
        duoId: z.string().uuid().nullable(),
      })).max(200),
    }).parse(req.body);

    const day = await db.centerDay.findUnique({ where: { id: centerDayId } });
    if (!day) throw new NotFoundError("Center day not found");
    if (assignments.length === 0) {
      res.json({ changed: 0, warnings: [] });
      return;
    }

    const passages = await db.passage.findMany({
      where: { id: { in: assignments.map((a) => a.passageId) } },
      include: { pool: true, duo: true },
    });
    if (passages.length !== assignments.length) throw new NotFoundError("Passage not found");
    const outside = passages.find((p) => p.pool.centerDayId !== day.id);
    if (outside) throw new BadRequestError(`Le passage ${outside.label} n'est pas de ce jour`);

    const duoIds = [...new Set(assignments.map((a) => a.duoId).filter((id): id is string => id !== null))];
    const duos = await db.juryDuo.findMany({ where: { id: { in: duoIds } } });
    if (duos.length !== duoIds.length) throw new NotFoundError("Duo not found");
    const foreign = duos.find((d) => d.centerDayId !== day.id);
    if (foreign) throw new BadRequestError(`Le duo ${foreign.number} n'est pas formé pour ce jour`);

    // A graded passage keeps its duo (same rule as a single assignment), but
    // here it's skipped rather than failing the whole batch.
    const byId = new Map(passages.map((p) => [p.id, p]));
    const asked = assignments.filter((a) => byId.get(a.passageId)!.duoId !== a.duoId);
    const graded = await gradedPassageIds(asked.map((a) => a.passageId));
    const changing = asked.filter((a) => !graded.has(a.passageId));
    const skipped = asked
      .filter((a) => graded.has(a.passageId))
      .map((a) => byId.get(a.passageId)!.label)
      .sort();

    const numberOf = new Map(duos.map((d) => [d.id, d.number]));
    const details = changing.map((a) => ({
      passage: byId.get(a.passageId)!.label,
      avant: byId.get(a.passageId)!.duo ? `Duo ${byId.get(a.passageId)!.duo!.number}` : "sans duo",
      après: a.duoId ? `Duo ${numberOf.get(a.duoId)}` : "sans duo",
    }));

    await db.$transaction(async (tx) => {
      for (const a of changing) {
        await tx.passage.update({ where: { id: a.passageId }, data: { duoId: a.duoId } });
      }
      if (changing.length > 0) {
        await audit(tx, req.user!, {
          category: "Duos",
          action: "passages.duo.auto",
          summary: `Attribution automatique des duos · ${dayName(day)} : ${changing.length} passage${changing.length > 1 ? "s" : ""} modifié${changing.length > 1 ? "s" : ""}`,
          details: { passages: details },
        });
      }
    });

    const warnings = (await Promise.all(duoIds.map((id) => duoPassageWarnings(id)))).flat();
    if (skipped.length > 0) {
      warnings.unshift(`Déjà noté${skipped.length > 1 ? "s" : ""}, donc inchangé${skipped.length > 1 ? "s" : ""} : ${skipped.join(", ")}`);
    }
    res.json({ changed: changing.length, skipped: skipped.length, warnings });
  } catch (err) { next(err); }
});

// PUT /api/duos/:id — { accountIds: [a, b] } -> { duo, warnings }
router.put("/:id", async (req, res, next) => {
  try {
    const { accountIds } = z.object({ accountIds: MembersSchema }).parse(req.body);
    const duo = await findDuoOrThrow(req.params.id);

    const current = duo.members.map((m) => m.account.id).sort().join();
    if (current !== [...accountIds].sort().join()) {
      if (await isDuoGraded(duo.id)) {
        throw new ConflictError(`Le Duo ${duo.number} a déjà noté des passages — ses jurés ne peuvent plus changer`);
      }
      await assertJurors(accountIds, duo.centerDayId, duo.id);
      const [before, after] = [await jurorNames(duo.members.map((m) => m.account.id)), await jurorNames(accountIds)];
      await db.$transaction(async (tx) => {
        await tx.duoMember.deleteMany({ where: { duoId: duo.id } });
        await tx.duoMember.createMany({ data: accountIds.map((accountId) => ({ duoId: duo.id, accountId })) });
        await audit(tx, req.user!, {
          category: "Duos",
          action: "duo.update",
          summary: `Duo ${duo.number} de ${dayName(duo.centerDay)} : ${after} (avant : ${before})`,
          details: { before: { jurés: before }, after: { jurés: after } },
        });
      });
    }

    const updated = await db.juryDuo.findUniqueOrThrow({ where: { id: duo.id }, include: duoInclude });
    res.json({ duo: toDuoResponse(updated), warnings: await jurorDateWarnings(accountIds, duo.centerDayId) });
  } catch (err) { next(err); }
});

// DELETE /api/duos/:id — its passages go back to "no duo"
router.delete("/:id", async (req, res, next) => {
  try {
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
  } catch (err) { next(err); }
});

export default router;
