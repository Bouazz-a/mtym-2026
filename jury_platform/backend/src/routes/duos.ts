import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly } from "../middleware/auth";
import { audit, dayName } from "../services/audit";
import { duoInclude, isDuoGraded, jurorDateWarnings, toDuoResponse } from "../services/duos";
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
