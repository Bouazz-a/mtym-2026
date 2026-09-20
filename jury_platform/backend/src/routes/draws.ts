import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly } from "../middleware/auth";
import { isDayGraded } from "../services/access";
import { audit, dayName } from "../services/audit";
import { validateDraw, validatePool } from "../services/draw";
import { teamsOf } from "../services/passages";
import { teamsInGrid, type PoolGrid } from "../services/poolGrid";
import { clearDrawValidation, findPools } from "../services/pools";
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
    const { leftOut } = validateDraw(pools, day.teams.map((t) => t.id));

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
        summary: `${replaced ? "Nouveau tirage" : "Tirage"} de ${dayName(day)} : ${pools.length} poule(s) (${pools.map((p) => p.label).join(", ")})${leftOut > 0 ? `, ${leftOut} équipe(s) sans poule` : ""}`,
        details: pools.map((p) => ({ pool: p.label, passages: p.passages.map((x) => x.label) })),
      });
      // The day's composition changed: it has to be validated again.
      await tx.centerDay.update({ where: { id: day.id }, data: { drawValidatedAt: null, drawValidatedBy: null } });
    });

    res.json(await findPools({ centerDayId: day.id }));
  } catch (err) { next(err); }
});

// POST /api/center-days/:id/draw — add pools for the teams that have none,
// leaving the pools already there (drawn or composed by hand) alone.
router.post("/:id/draw", async (req, res, next) => {
  try {
    const { pools } = DrawSchema.parse(req.body);
    const day = await findDayOrThrow(req.params.id);

    // Teams already spoken for, drafts included
    const existing = await db.pool.findMany({ where: { centerDayId: day.id }, include: { passages: true } });
    const taken = new Set<string>();
    for (const pool of existing) {
      for (const p of pool.passages) for (const id of teamsOf(p)) taken.add(id);
      const draft = pool.draft as unknown as PoolGrid | null;
      if (draft) for (const id of teamsInGrid(draft)) taken.add(id);
    }
    const usedLabels = new Set(existing.map((p) => p.label));

    const dayTeams = new Set(day.teams.map((t) => t.id));
    for (const pool of pools) {
      if (usedLabels.has(pool.label)) throw new BadRequestError(`Libellé de poule en double : ${pool.label}`);
      validatePool(pool, dayTeams, taken);
      for (const id of new Set(pool.passages.flatMap(teamsOf))) taken.add(id);
      usedLabels.add(pool.label);
    }

    await db.$transaction(async (tx) => {
      for (const pool of pools) {
        await tx.pool.create({
          data: {
            label: pool.label,
            centerDayId: day.id,
            passages: { create: pool.passages.map((p) => ({ ...p, extraTeamId: p.extraTeamId ?? null })) },
          },
        });
      }
      await audit(tx, req.user!, {
        category: "Tirage",
        action: "draw.complete",
        summary: `Tirage complété pour ${dayName(day)} : ${pools.length} poule(s) ajoutée(s) (${pools.map((p) => p.label).join(", ")})`,
        details: pools.map((p) => ({ pool: p.label, passages: p.passages.map((x) => x.label) })),
      });
      await tx.centerDay.update({ where: { id: day.id }, data: { drawValidatedAt: null, drawValidatedBy: null } });
    });

    res.status(201).json(await findPools({ centerDayId: day.id }));
  } catch (err) { next(err); }
});

// PUT /api/center-days/:id/draw-validation — { validated }: the day's
// composition is settled (or reopened). Teams may be left without a pool;
// a pool still being composed (a draft) blocks it.
router.put("/:id/draw-validation", async (req, res, next) => {
  try {
    const { validated } = z.object({ validated: z.boolean() }).parse(req.body);
    const day = await findDayOrThrow(req.params.id);
    const pools = await db.pool.findMany({ where: { centerDayId: day.id }, include: { passages: true } });

    if (validated) {
      const drafts = pools.filter((p) => p.draft !== null);
      if (drafts.length > 0) {
        throw new ConflictError(`À terminer avant de valider : ${drafts.map((p) => p.label).join(", ")} ${drafts.length > 1 ? "sont des brouillons" : "est un brouillon"}`);
      }
      if (pools.length === 0) throw new BadRequestError("Ce jour n'a pas encore de poule");
    }

    const placed = new Set(pools.flatMap((p) => p.passages.flatMap(teamsOf)));
    const leftOut = day.teams.length - placed.size;
    const actor = `${req.user!.firstName} ${req.user!.lastName}`;

    const updated = await db.$transaction(async (tx) => {
      const saved = await tx.centerDay.update({
        where: { id: day.id },
        data: validated
          ? { drawValidatedAt: new Date(), drawValidatedBy: actor }
          : { drawValidatedAt: null, drawValidatedBy: null },
      });
      await audit(tx, req.user!, {
        category: "Tirage",
        action: validated ? "draw.validate" : "draw.invalidate",
        summary: validated
          ? `Tirage validé pour ${dayName(day)} : ${pools.length} poule(s), ${placed.size} équipe(s) placée(s)${leftOut > 0 ? `, ${leftOut} sans poule` : ""}`
          : `Validation du tirage retirée pour ${dayName(day)}`,
      });
      return saved;
    });
    res.json(updated);
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
      await clearDrawValidation(tx, day.id);
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
      await clearDrawValidation(tx, day.id);
    });

    res.json(await findPools({ centerDayId: day.id }));
  } catch (err) { next(err); }
});

export default router;
