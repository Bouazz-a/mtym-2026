import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { authenticate, requireRole, requireOrganizerRole } from "../middleware/auth";
import { BadRequestError } from "../utils/errors";

const router = Router();

const adminOnly = [authenticate, requireRole("organizer"), requireOrganizerRole("admin")];

const PoolSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  round: z.number().int(),
});

const PassageSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  problemNumber: z.number().int(),
  poolId: z.string().uuid(),
  defenderTeamId: z.string().uuid(),
  opponentTeamId: z.string().uuid(),
  reporterTeamId: z.string().uuid(),
  extraTeamId: z.string().uuid().nullable().optional(),
  day: z.string().optional(),
  timeSlot: z.string().optional(),
  room: z.string().optional(),
});

const RoundDataSchema = z.object({
  pools: z.array(PoolSchema),
  passages: z.array(PassageSchema),
  teamPoolAssignments: z.array(z.object({
    teamId: z.string().uuid(),
    poolId: z.string().uuid(),
  })),
});

const SaveSchema = z.object({
  round1: RoundDataSchema,
  round2: RoundDataSchema,
  report: z.object({
    generatedAt: z.string(),
    totalScore: z.number().int(),
    violations: z.array(z.record(z.unknown())),
  }),
});

// POST /api/rounds — persist client-computed round results
router.post("/", ...adminOnly, async (req, res, next) => {
  try {
    const body = SaveSchema.parse(req.body);

    await db.$transaction(async (tx) => {
      // Wipe round 2 then round 1
      for (const round of [2, 1]) {
        const pools = await tx.pool.findMany({ where: { round } });
        const poolIds = pools.map((p) => p.id);
        await tx.passage.deleteMany({ where: { poolId: { in: poolIds } } });
        await tx.pool.deleteMany({ where: { id: { in: poolIds } } });
      }
      await tx.team.updateMany({ data: { poolIdRound1: null, poolIdRound2: null } });

      await tx.pool.createMany({ data: body.round1.pools });
      await tx.passage.createMany({ data: body.round1.passages });
      for (const { teamId, poolId } of body.round1.teamPoolAssignments) {
        await tx.team.update({ where: { id: teamId }, data: { poolIdRound1: poolId } });
      }

      await tx.pool.createMany({ data: body.round2.pools });
      await tx.passage.createMany({ data: body.round2.passages });
      for (const { teamId, poolId } of body.round2.teamPoolAssignments) {
        await tx.team.update({ where: { id: teamId }, data: { poolIdRound2: poolId } });
      }

      await tx.constraintReport.deleteMany();
      await tx.constraintReport.create({
        data: {
          generatedAt: body.report.generatedAt,
          totalScore: body.report.totalScore,
          violations: body.report.violations as unknown as Prisma.InputJsonValue,
        },
      });
    });

    res.status(204).send();
  } catch (err) { next(err); }
});

// DELETE /api/rounds/:round
router.delete("/:round", ...adminOnly, async (req, res, next) => {
  try {
    const round = parseInt(req.params.round, 10);
    if (round !== 1 && round !== 2) throw new BadRequestError("Round must be 1 or 2");

    await db.$transaction(async (tx) => {
      const pools = await tx.pool.findMany({ where: { round } });
      const poolIds = pools.map((p) => p.id);
      await tx.passage.deleteMany({ where: { poolId: { in: poolIds } } });
      await tx.pool.deleteMany({ where: { id: { in: poolIds } } });
      if (round === 1) await tx.team.updateMany({ data: { poolIdRound1: null } });
      else await tx.team.updateMany({ data: { poolIdRound2: null } });
    });

    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
