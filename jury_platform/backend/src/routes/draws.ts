import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { generateQualifsDay } from "../algorithms/poolDraw";
import { adminOnly } from "../middleware/auth";
import { isDayGraded } from "../services/access";
import { audit, dayName } from "../services/audit";
import { nextPoolNumber, poolLabelPrefix } from "../services/centers";
import { validateDraw, type DrawPool } from "../services/draw";
import { teamsOf } from "../services/passages";
import { clearDrawValidation, createPools, findPools, teamsInPools } from "../services/pools";
import { asyncRoute, BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

// Pool draws of a center day — mounted under /api/center-days. The draw
// itself is computed here (algorithms/poolDraw.ts); the admin UI only asks.
const router = Router();
router.use(...adminOnly);

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

const drawDetails = (pools: DrawPool[]) => pools.map((p) => ({ pool: p.label, passages: p.passages.map((x) => x.label) }));
const labels = (pools: DrawPool[]) => pools.map((p) => p.label).join(", ");

// PUT /api/center-days/:id/draw — draw the day's pools, replacing the
// ones there. The day's duos stay, but the new passages have no duo yet.
router.put("/:id/draw", asyncRoute(async (req, res) => {
  const day = await findDayOrThrow(req.params.id);
  await assertNotGraded(day.id);
  const { pools } = generateQualifsDay({ teams: day.teams, labelPrefix: await poolLabelPrefix(day) });
  if (pools.length === 0) throw new BadRequestError("Il faut au moins 3 équipes pour former une poule");
  const { leftOut } = validateDraw(pools, day.teams.map((t) => t.id));

  const replaced = await db.pool.count({ where: { centerDayId: day.id } });
  await db.$transaction(async (tx) => {
    await tx.pool.deleteMany({ where: { centerDayId: day.id } });
    await createPools(tx, day.id, pools);
    await audit(tx, req.user!, {
      category: "Tirage",
      action: replaced ? "draw.redo" : "draw.create",
      summary: `${replaced ? "Nouveau tirage" : "Tirage"} de ${dayName(day)} : ${pools.length} poule(s) (${labels(pools)})${leftOut > 0 ? `, ${leftOut} équipe(s) sans poule` : ""}`,
      details: drawDetails(pools),
    });
    await clearDrawValidation(tx, day.id);
  });

  res.json(await findPools({ centerDayId: day.id }));
}));

// POST /api/center-days/:id/draw — draw pools for the teams that have none,
// leaving the pools already there (drawn or composed by hand) alone.
router.post("/:id/draw", asyncRoute(async (req, res) => {
  const day = await findDayOrThrow(req.params.id);

  // Teams already spoken for, drafts included
  const existing = await db.pool.findMany({ where: { centerDayId: day.id }, include: { passages: true } });
  const taken = teamsInPools(existing);
  const free = day.teams.filter((t) => !taken.has(t.id));
  if (free.length < 3) throw new BadRequestError("Moins de 3 équipes sans poule : pas de poule à former");

  const { pools } = generateQualifsDay({
    teams: free,
    labelPrefix: await poolLabelPrefix(day),
    labelStart: nextPoolNumber(existing.map((p) => p.label)),
  });
  // The new pools only hold free teams: checked against the free teams alone
  validateDraw(pools, free.map((t) => t.id));

  await db.$transaction(async (tx) => {
    await createPools(tx, day.id, pools);
    await audit(tx, req.user!, {
      category: "Tirage",
      action: "draw.complete",
      summary: `Tirage complété pour ${dayName(day)} : ${pools.length} poule(s) ajoutée(s) (${labels(pools)})`,
      details: drawDetails(pools),
    });
    await clearDrawValidation(tx, day.id);
  });

  res.status(201).json(await findPools({ centerDayId: day.id }));
}));

// PUT /api/center-days/:id/draw-validation — { validated }: the day's
// composition is settled (or reopened). Teams may be left without a pool;
// a pool still being composed (a draft) blocks it.
router.put("/:id/draw-validation", asyncRoute(async (req, res) => {
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
}));

// DELETE /api/center-days/:id/pools — undo the day's draw
router.delete("/:id/pools", asyncRoute(async (req, res) => {
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
}));

// POST /api/center-days/:id/swap-teams — { teamA, teamB }: the two teams
// trade places in every passage of the day (across pools, or roles within one).
router.post("/:id/swap-teams", asyncRoute(async (req, res) => {
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
}));

export default router;
