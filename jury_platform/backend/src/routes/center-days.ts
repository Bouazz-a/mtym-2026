import { Router } from "express";
import { z } from "zod";
import { Center } from "@prisma/client";
import { db } from "../db";
import { adminOnly, authenticate } from "../middleware/auth";
import { audit, centerName, dayName } from "../services/audit";
import { describeScheduleChange, ScheduleSchema, scheduleRecord, type ScheduleSlot } from "../services/schedule";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

const router = Router();

const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date au format AAAA-MM-JJ")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Date invalide");

const CenterDaySchema = z.object({
  center: z.nativeEnum(Center),
  date: DateSchema,
});

const withCounts = { _count: { select: { teams: true, pools: true } } } as const;

async function assertDayIsFree(center: Center, date: string, exceptId?: string) {
  const clash = await db.centerDay.findUnique({ where: { center_date: { center, date } } });
  if (clash && clash.id !== exceptId) throw new ConflictError("Ce jour existe déjà pour ce centre");
}

// GET /api/center-days?center=
router.get("/", authenticate, async (req, res, next) => {
  try {
    const center = z.nativeEnum(Center).optional().parse(req.query.center);
    res.json(await db.centerDay.findMany({
      where: center ? { center } : {},
      include: withCounts,
      orderBy: [{ center: "asc" }, { date: "asc" }],
    }));
  } catch (err) { next(err); }
});

// POST /api/center-days — { center, date }
router.post("/", ...adminOnly, async (req, res, next) => {
  try {
    const data = CenterDaySchema.parse(req.body);
    await assertDayIsFree(data.center, data.date);
    const day = await db.$transaction(async (tx) => {
      const created = await tx.centerDay.create({ data, include: withCounts });
      await audit(tx, req.user!, { category: "Jours", action: "day.create", summary: `Jour ajouté : ${dayName(created)}` });
      return created;
    });
    res.status(201).json(day);
  } catch (err) { next(err); }
});

// POST /api/center-days/distribute — { center }: spread the center's teams
// that have no day yet across its days, keeping day sizes balanced.
router.post("/distribute", ...adminOnly, async (req, res, next) => {
  try {
    const { center } = z.object({ center: z.nativeEnum(Center) }).parse(req.body);

    const days = await db.centerDay.findMany({
      where: { center },
      include: withCounts,
      orderBy: { date: "asc" },
    });
    if (!days.length) throw new BadRequestError("Ajoutez d'abord les jours de ce centre");

    const unassigned = await db.team.findMany({
      where: { center, centerDayId: null },
      select: { id: true },
    });

    // Each team goes to the currently smallest day (earliest date on ties),
    // in random order so repeated runs don't always pair the same teams.
    const load = days.map((d) => ({ id: d.id, count: d._count.teams, teamIds: [] as string[] }));
    for (const { id } of shuffle(unassigned)) {
      const target = load.reduce((min, d) => (d.count < min.count ? d : min));
      target.teamIds.push(id);
      target.count++;
    }

    await db.$transaction(async (tx) => {
      for (const d of load.filter((d) => d.teamIds.length)) {
        await tx.team.updateMany({ where: { id: { in: d.teamIds } }, data: { centerDayId: d.id } });
      }
      await audit(tx, req.user!, {
        category: "Équipes",
        action: "teams.distribute",
        summary: `${unassigned.length} équipe(s) sans jour réparties sur les jours de ${centerName(center)}`,
        details: days.map((d) => ({ day: d.date, added: load.find((l) => l.id === d.id)!.teamIds.length })),
      });
    });

    res.json({
      assigned: unassigned.length,
      days: load.map(({ id, count }) => ({ id, teams: count })),
    });
  } catch (err) { next(err); }
});

// PUT /api/center-days/:id — { date }
router.put("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const { date } = z.object({ date: DateSchema }).parse(req.body);
    const day = await db.centerDay.findUnique({ where: { id: req.params.id } });
    if (!day) throw new NotFoundError("Center day not found");
    await assertDayIsFree(day.center, date, day.id);
    const updated = await db.$transaction(async (tx) => {
      const saved = await tx.centerDay.update({ where: { id: day.id }, data: { date }, include: withCounts });
      if (date !== day.date) {
        await audit(tx, req.user!, {
          category: "Jours",
          action: "day.update",
          summary: `Jour ${dayName(day)} déplacé au ${date}`,
          details: { before: { date: day.date }, after: { date } },
        });
      }
      return saved;
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// PUT /api/center-days/:id/schedule — { slots: [{ start, minutes }] × 4 }:
// the day's passage times, shared by all its pools.
router.put("/:id/schedule", ...adminOnly, async (req, res, next) => {
  try {
    const { slots } = z.object({ slots: ScheduleSchema }).parse(req.body);
    const day = await db.centerDay.findUnique({ where: { id: req.params.id } });
    if (!day) throw new NotFoundError("Center day not found");
    const before = day.schedule as unknown as ScheduleSlot[];
    const changed = slots.some((s, i) => before[i]?.start !== s.start || before[i]?.minutes !== s.minutes);
    const updated = await db.$transaction(async (tx) => {
      const saved = await tx.centerDay.update({ where: { id: day.id }, data: { schedule: slots }, include: withCounts });
      if (changed) {
        await audit(tx, req.user!, {
          category: "Horaires",
          action: "day.schedule",
          summary: `Horaires ${dayName(day)} : ${describeScheduleChange(before, slots)}`,
          details: { before: scheduleRecord(before), after: scheduleRecord(slots) },
        });
      }
      return saved;
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/center-days/:id — its teams go back to "no day"
router.delete("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const day = await db.centerDay.findUnique({ where: { id: req.params.id }, include: withCounts });
    if (!day) throw new NotFoundError("Center day not found");
    if (day._count.pools > 0) {
      throw new ConflictError("Ce jour a déjà un tirage — supprimez d'abord ses poules");
    }
    await db.$transaction(async (tx) => {
      await tx.centerDay.delete({ where: { id: day.id } });
      await audit(tx, req.user!, {
        category: "Jours",
        action: "day.delete",
        summary: `Jour supprimé : ${dayName(day)} (${day._count.teams} équipe(s) repassent sans jour)`,
      });
    });
    res.status(204).send();
  } catch (err) { next(err); }
});

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default router;
