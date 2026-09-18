import { Router } from "express";
import { z } from "zod";
import { Center } from "@prisma/client";
import { db } from "../db";
import { adminOnly, authenticate } from "../middleware/auth";
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
    res.status(201).json(await db.centerDay.create({ data, include: withCounts }));
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

    await db.$transaction(
      load
        .filter((d) => d.teamIds.length)
        .map((d) => db.team.updateMany({ where: { id: { in: d.teamIds } }, data: { centerDayId: d.id } })),
    );

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
    res.json(await db.centerDay.update({ where: { id: day.id }, data: { date }, include: withCounts }));
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
    await db.centerDay.delete({ where: { id: day.id } });
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
