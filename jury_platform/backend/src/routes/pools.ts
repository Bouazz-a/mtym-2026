import { Router } from "express";
import { z } from "zod";
import { Center, Prisma } from "@prisma/client";
import { db } from "../db";
import { adminOnly, authenticate } from "../middleware/auth";
import { audit, dayName } from "../services/audit";
import { firstFreeLabel, poolLabelPrefix } from "../services/centers";
import { passagesJudgedBy, gradedPassageIds } from "../services/duos";
import { pickProblems, QUALIFS_PROBLEMS, slotLoad } from "../algorithms/poolDraw";
import { clearDrawValidation, findPools, playedProblems, poolInclude, teamsInPools, toPoolResponse } from "../services/pools";
import { emptyGrid, isComplete, toDrawPool, validateGrid, type PoolGrid } from "../services/poolGrid";
import { teamsOf } from "../services/passages";
import { assertNoAssignedReports } from "../services/reportPool";
import { asyncRoute, BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

const router = Router();

const ListQuery = z.object({
  center: z.nativeEnum(Center).optional(),
  centerDayId: z.string().uuid().optional(),
});

// GET /api/pools?center=&centerDayId= — admin: all pools; jury: the pools
// where their duo judges at least one passage
router.get("/", authenticate, asyncRoute(async (req, res) => {
  const { center, centerDayId } = ListQuery.parse(req.query);
  const user = req.user!;
  const where: Prisma.PoolWhereInput = {
    ...(centerDayId ? { centerDayId } : {}),
    ...(center ? { centerDay: { center } } : {}),
    ...(user.role === "jury" ? { passages: { some: passagesJudgedBy(user.id) } } : {}),
  };
  res.json(await findPools(where));
}));

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

async function findPoolOrThrow(id: string) {
  const pool = await db.pool.findUnique({ where: { id }, include: { ...poolInclude, passages: true } });
  if (!pool) throw new NotFoundError("Pool not found");
  if (!pool.centerDayId || !pool.centerDay) throw new BadRequestError("Cette poule n'est rattachée à aucun jour");
  return pool;
}

async function assertNotGraded(poolId: string, action: string) {
  const passages = await db.passage.findMany({ where: { poolId } });
  const graded = await gradedPassageIds(passages.map((p) => p.id));
  if (graded.size > 0) throw new ConflictError(`Des notes existent déjà pour cette poule — elle ne peut plus ${action}`);
  await assertNoAssignedReports({ teamIds: [...new Set(passages.flatMap(teamsOf))] });
}

// POST /api/pools — { centerDayId, size } -> an empty pool to fill in, in the
// same label series as the day's draw
router.post("/", ...adminOnly, asyncRoute(async (req, res) => {
  const { centerDayId, size } = z.object({
    centerDayId: z.string().uuid(),
    size: z.union([z.literal(3), z.literal(4)]),
  }).parse(req.body);

  const day = await db.centerDay.findUnique({ where: { id: centerDayId } });
  if (!day) throw new NotFoundError("Center day not found");

  const existing = await db.pool.findMany({ where: { centerDayId }, include: { passages: true } });
  const label = firstFreeLabel(await poolLabelPrefix(day), new Set(existing.map((p) => p.label)));
  // Default problems that vary each slot's problems with the day's other pools
  const problems = pickProblems(size, QUALIFS_PROBLEMS, slotLoad(playedProblems(existing)));
  const pool = await db.$transaction(async (tx) => {
    const created = await tx.pool.create({
      data: { label, centerDayId: day.id, draft: emptyGrid(size, problems) as unknown as Prisma.InputJsonValue },
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
}));

// PUT /api/pools/:id — the whole grid. Complete, it becomes real passages;
// incomplete, it stays a draft.
router.put("/:id", ...adminOnly, asyncRoute(async (req, res) => {
  const grid = GridSchema.parse(req.body) as PoolGrid;
  const pool = await findPoolOrThrow(req.params.id);
  await assertNotGraded(pool.id, "être modifiée");

  const day = pool.centerDay!;
  const dayTeams = new Set((await db.team.findMany({ where: { centerDayId: day.id }, select: { id: true } })).map((t) => t.id));
  const others = await db.pool.findMany({ where: { centerDayId: day.id, id: { not: pool.id } }, include: { passages: true } });
  validateGrid(pool.label, grid, dayTeams, teamsInPools(others));

  const complete = isComplete(grid);
  const saved = await db.$transaction(async (tx) => {
    if (complete) {
      // Keep one Passage row per slot so an already-assigned duo survives
      // a change of room or problem.
      await tx.passage.deleteMany({ where: { poolId: pool.id, slot: { notIn: grid.passages.map((p) => p.slot) } } });
      const rooms = new Map(grid.passages.map((p) => [p.slot, p.room]));
      for (const p of toDrawPool(pool.label, grid).passages) {
        const data = { ...p, extraTeamId: p.extraTeamId ?? null, room: rooms.get(p.slot) ?? null };
        const existing = pool.passages.find((x) => x.slot === p.slot);
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
}));

// DELETE /api/pools/:id — refused once one of its passages is graded
router.delete("/:id", ...adminOnly, asyncRoute(async (req, res) => {
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
}));

export default router;
