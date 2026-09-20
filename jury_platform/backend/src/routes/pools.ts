import { Router } from "express";
import { z } from "zod";
import { Center, Prisma } from "@prisma/client";
import { db } from "../db";
import { adminOnly, authenticate } from "../middleware/auth";
import { audit, dayName } from "../services/audit";
import { passagesJudgedBy, gradedPassageIds } from "../services/duos";
import { clearDrawValidation, findPools, poolInclude, toPoolResponse } from "../services/pools";
import { emptyGrid, isComplete, teamsInGrid, validateGrid, type PoolGrid } from "../services/poolGrid";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

const router = Router();

const ListQuery = z.object({
  center: z.nativeEnum(Center).optional(),
  centerDayId: z.string().uuid().optional(),
});

// GET /api/pools?center=&centerDayId= — admin: all pools; jury: the pools
// where their duo judges at least one passage
router.get("/", authenticate, async (req, res, next) => {
  try {
    const { center, centerDayId } = ListQuery.parse(req.query);
    const user = req.user!;
    const where: Prisma.PoolWhereInput = {
      ...(centerDayId ? { centerDayId } : {}),
      ...(center ? { centerDay: { center } } : {}),
      ...(user.role === "jury" ? { passages: { some: passagesJudgedBy(user.id) } } : {}),
    };
    res.json(await findPools(where));
  } catch (err) { next(err); }
});

// ─── Pools composed by hand ───────────────────────────────────────────
// A pool the admin fills cell by cell. Until its grid is complete it has no
// passages, only Pool.draft, so the rest of the platform keeps its promise
// that a passage always has its three teams.

const GridSchema = z.object({
  size: z.union([z.literal(3), z.literal(4)]),
  passages: z.array(z.object({
    slot: z.number().int().min(1).max(4),
    problemNumber: z.number().int().min(1).max(4),
    defenderTeamId: z.string().uuid().nullable(),
    opponentTeamId: z.string().uuid().nullable(),
    reporterTeamId: z.string().uuid().nullable(),
    extraTeamId: z.string().uuid().nullable(),
    room: z.string().trim().max(120).nullable(),
  })).min(3).max(4),
});

const CENTER_CODES: Record<string, string> = {
  casablanca: "CAS", rabat: "RAB", martil: "MAR", benguerir: "BEN",
  agadir: "AGA", fez: "FES", oujda: "OUJ", online: "ONL",
};

// "CAS-B" for the second day of Casablanca — the same rule as the draw's
// labels, so hand-made pools sit in the same series.
async function nextLabel(centerDayId: string): Promise<string> {
  const day = await db.centerDay.findUniqueOrThrow({ where: { id: centerDayId } });
  const days = await db.centerDay.findMany({ where: { center: day.center }, orderBy: { date: "asc" } });
  const prefix = `${CENTER_CODES[day.center] ?? day.center.slice(0, 3).toUpperCase()}-${String.fromCharCode(65 + days.findIndex((d) => d.id === day.id))}`;
  const used = new Set((await db.pool.findMany({ where: { centerDayId }, select: { label: true } })).map((p) => p.label));
  let index = 1;
  while (used.has(`${prefix}${index}`)) index++;
  return `${prefix}${index}`;
}

async function findPoolOrThrow(id: string) {
  const pool = await db.pool.findUnique({ where: { id }, include: { ...poolInclude, passages: true } });
  if (!pool) throw new NotFoundError("Pool not found");
  if (!pool.centerDayId || !pool.centerDay) throw new BadRequestError("Cette poule n'est rattachée à aucun jour");
  return pool;
}

// Teams of the day already placed in *another* pool
async function teamsTakenElsewhere(centerDayId: string, exceptPoolId: string): Promise<Set<string>> {
  const pools = await db.pool.findMany({
    where: { centerDayId, id: { not: exceptPoolId } },
    include: { passages: true },
  });
  const taken = new Set<string>();
  for (const pool of pools) {
    for (const p of pool.passages) {
      for (const id of [p.defenderTeamId, p.opponentTeamId, p.reporterTeamId, p.extraTeamId]) {
        if (id) taken.add(id);
      }
    }
    const draft = pool.draft as unknown as PoolGrid | null;
    if (draft) for (const id of teamsInGrid(draft)) taken.add(id);
  }
  return taken;
}

async function assertNotGraded(poolId: string, action: string) {
  const passages = await db.passage.findMany({ where: { poolId }, select: { id: true } });
  const graded = await gradedPassageIds(passages.map((p) => p.id));
  if (graded.size > 0) throw new ConflictError(`Des notes existent déjà pour cette poule — elle ne peut plus ${action}`);
}

// POST /api/pools — { centerDayId, size } -> an empty pool to fill in
router.post("/", ...adminOnly, async (req, res, next) => {
  try {
    const { centerDayId, size } = z.object({
      centerDayId: z.string().uuid(),
      size: z.union([z.literal(3), z.literal(4)]),
    }).parse(req.body);

    const day = await db.centerDay.findUnique({ where: { id: centerDayId } });
    if (!day) throw new NotFoundError("Center day not found");

    const label = await nextLabel(day.id);
    const pool = await db.$transaction(async (tx) => {
      const created = await tx.pool.create({
        data: { label, centerDayId: day.id, draft: emptyGrid(size) as unknown as Prisma.InputJsonValue },
        include: poolInclude,
      });
      await audit(tx, req.user!, {
        category: "Tirage",
        action: "pool.create",
        summary: `Poule ${label} créée à la main pour ${dayName(day)} (${size} équipes)`,
      });
      await clearDrawValidation(tx, day.id);
      return created;
    });
    res.status(201).json(toPoolResponse(pool));
  } catch (err) { next(err); }
});

// PUT /api/pools/:id — the whole grid. Complete, it becomes real passages;
// incomplete, it stays a draft.
router.put("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const grid = GridSchema.parse(req.body) as PoolGrid;
    const pool = await findPoolOrThrow(req.params.id);
    await assertNotGraded(pool.id, "être modifiée");

    const day = pool.centerDay!;
    const dayTeams = new Set((await db.team.findMany({ where: { centerDayId: day.id }, select: { id: true } })).map((t) => t.id));
    validateGrid(pool.label, grid, dayTeams, await teamsTakenElsewhere(day.id, pool.id));

    const complete = isComplete(grid);
    const saved = await db.$transaction(async (tx) => {
      if (complete) {
        // Keep one Passage row per slot so an already-assigned duo survives
        // a change of room or problem.
        await tx.passage.deleteMany({ where: { poolId: pool.id, slot: { notIn: grid.passages.map((p) => p.slot) } } });
        for (const p of grid.passages) {
          const existing = pool.passages.find((x) => x.slot === p.slot);
          const data = {
            label: `${pool.label}P${p.slot}`,
            problemNumber: p.problemNumber,
            defenderTeamId: p.defenderTeamId!,
            opponentTeamId: p.opponentTeamId!,
            reporterTeamId: p.reporterTeamId!,
            extraTeamId: p.extraTeamId,
            room: p.room,
            slot: p.slot,
          };
          if (existing) await tx.passage.update({ where: { id: existing.id }, data });
          else await tx.passage.create({ data: { ...data, poolId: pool.id } });
        }
      } else {
        await tx.passage.deleteMany({ where: { poolId: pool.id } });
      }
      const updated = await tx.pool.update({
        where: { id: pool.id },
        data: { draft: complete ? Prisma.DbNull : (grid as unknown as Prisma.InputJsonValue) },
        include: poolInclude,
      });
      await audit(tx, req.user!, {
        category: "Tirage",
        action: complete ? "pool.complete" : "pool.draft",
        summary: complete
          ? `Poule ${pool.label} de ${dayName(day)} enregistrée (${grid.size} équipes)`
          : `Poule ${pool.label} de ${dayName(day)} enregistrée en brouillon`,
        details: {
          passages: grid.passages.map((p) => ({
            créneau: p.slot,
            problème: p.problemNumber,
            def: p.defenderTeamId,
            opp: p.opponentTeamId,
            rap: p.reporterTeamId,
            obs: p.extraTeamId,
            salle: p.room,
          })),
        },
      });
      await clearDrawValidation(tx, day.id);
      return updated;
    });
    res.json(toPoolResponse(saved));
  } catch (err) { next(err); }
});

// DELETE /api/pools/:id — refused once one of its passages is graded
router.delete("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const pool = await findPoolOrThrow(req.params.id);
    await assertNotGraded(pool.id, "être supprimée");
    await db.$transaction(async (tx) => {
      await tx.pool.delete({ where: { id: pool.id } });
      await audit(tx, req.user!, {
        category: "Tirage",
        action: "pool.delete",
        summary: `Poule ${pool.label} de ${dayName(pool.centerDay!)} supprimée (${pool.passages.length} passage(s))`,
      });
      await clearDrawValidation(tx, pool.centerDayId);
    });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
