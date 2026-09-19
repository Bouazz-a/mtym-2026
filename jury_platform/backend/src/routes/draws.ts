import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly } from "../middleware/auth";
import { isDayGraded } from "../services/access";
import { audit, dayName } from "../services/audit";
import { validateDraw } from "../services/draw";
import { findPools } from "../services/pools";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

// Pool draws of a center day — mounted under /api/center-days.
const router = Router();
router.use(...adminOnly);

const DrawSchema = z.object({
  pools: z.array(z.object({
    label: z.string().trim().min(1),
    passages: z.array(z.object({
      label: z.string().trim().min(1),
      problemNumber: z.number().int().min(1).max(4),
      defenderTeamId: z.string().uuid(),
      opponentTeamId: z.string().uuid(),
      reporterTeamId: z.string().uuid(),
      extraTeamId: z.string().uuid().nullable().optional(),
      slot: z.number().int().min(1).max(4),
    })),
  })).min(1),
});

async function findDayOrThrow(id: string) {
  const day = await db.centerDay.findUnique({
    where: { id },
    include: { teams: { select: { id: true } } },
  });
  if (!day) throw new NotFoundError("Center day not found");
  return day;
}

async function assertNotGraded(centerDayId: string) {
  if (await isDayGraded(centerDayId)) {
    throw new ConflictError("Des notes existent déjà pour ce jour — ses poules ne peuvent plus être modifiées");
  }
}

// PUT /api/center-days/:id/draw — replace the day's pools with a draw
// computed by the admin UI. The day's duos stay, but the new passages have
// no duo yet.
router.put("/:id/draw", async (req, res, next) => {
  try {
    const { pools } = DrawSchema.parse(req.body);
    const day = await findDayOrThrow(req.params.id);
    await assertNotGraded(day.id);
    validateDraw(pools, day.teams.map((t) => t.id));

    const replaced = await db.pool.count({ where: { centerDayId: day.id } });
    await db.$transaction(async (tx) => {
      await tx.pool.deleteMany({ where: { centerDayId: day.id } });
      for (const pool of pools) {
        await tx.pool.create({
          data: {
            label: pool.label,
            centerDayId: day.id,
            passages: {
              create: pool.passages.map((p) => ({ ...p, extraTeamId: p.extraTeamId ?? null })),
            },
          },
        });
      }
      await audit(tx, req.user!, {
        category: "Tirage",
        action: replaced ? "draw.redo" : "draw.create",
        summary: `${replaced ? "Nouveau tirage" : "Tirage"} de ${dayName(day)} : ${pools.length} poule(s) (${pools.map((p) => p.label).join(", ")})`,
        details: pools.map((p) => ({ pool: p.label, passages: p.passages.map((x) => x.label) })),
      });
    });

    res.json(await findPools({ centerDayId: day.id }));
  } catch (err) { next(err); }
});

// DELETE /api/center-days/:id/pools — undo the day's draw
router.delete("/:id/pools", async (req, res, next) => {
  try {
    const day = await findDayOrThrow(req.params.id);
    await assertNotGraded(day.id);
    await db.$transaction(async (tx) => {
      const { count } = await tx.pool.deleteMany({ where: { centerDayId: day.id } });
      await audit(tx, req.user!, {
        category: "Tirage",
        action: "draw.cancel",
        summary: `Tirage annulé pour ${dayName(day)} (${count} poule(s) supprimée(s))`,
      });
    });
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /api/center-days/:id/swap-teams — { teamA, teamB }: the two teams
// trade places in every passage of the day (across pools, or roles within one).
router.post("/:id/swap-teams", async (req, res, next) => {
  try {
    const { teamA, teamB } = z.object({
      teamA: z.string().uuid(),
      teamB: z.string().uuid(),
    }).parse(req.body);
    if (teamA === teamB) throw new BadRequestError("Choisissez deux équipes différentes");

    const day = await findDayOrThrow(req.params.id);
    const dayTeams = new Set(day.teams.map((t) => t.id));
    if (!dayTeams.has(teamA) || !dayTeams.has(teamB)) {
      throw new BadRequestError("Les deux équipes doivent jouer ce jour-là");
    }
    await assertNotGraded(day.id);

    const swap = (id: string) => (id === teamA ? teamB : id === teamB ? teamA : id);
    const passages = await db.passage.findMany({ where: { pool: { centerDayId: day.id } } });
    const teams = await db.team.findMany({ where: { id: { in: [teamA, teamB] } }, select: { id: true, quadrigram: true } });
    const quad = (id: string) => teams.find((t) => t.id === id)?.quadrigram ?? "?";
    await db.$transaction(async (tx) => {
      for (const p of passages) {
        await tx.passage.update({
          where: { id: p.id },
          data: {
            defenderTeamId: swap(p.defenderTeamId),
            opponentTeamId: swap(p.opponentTeamId),
            reporterTeamId: swap(p.reporterTeamId),
            extraTeamId: p.extraTeamId && swap(p.extraTeamId),
          },
        });
      }
      await audit(tx, req.user!, {
        category: "Tirage",
        action: "draw.swap",
        summary: `${quad(teamA)} et ${quad(teamB)} échangées dans les passages de ${dayName(day)}`,
      });
    });

    res.json(await findPools({ centerDayId: day.id }));
  } catch (err) { next(err); }
});

export default router;
