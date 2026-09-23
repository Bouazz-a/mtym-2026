import { Router } from "express";
import { z } from "zod";
import { Center, type Prisma } from "@prisma/client";
import { db } from "../db";
import { adminOnly, authenticate } from "../middleware/auth";
import { isTeamInPool, juryTeamIds } from "../services/access";
import { audit } from "../services/audit";
import { centerName } from "../services/centers";
import { asyncRoute, BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

const router = Router();

// Report ids + problem numbers only — the file itself is reached through
// GET /api/reports/:id/url, which checks access per report.
const teamInclude = {
  reports: {
    select: { id: true, problemNumber: true },
    orderBy: { problemNumber: "asc" },
  },
} satisfies Prisma.TeamInclude;

const ListQuery = z.object({
  center: z.nativeEnum(Center).optional(),
  centerDayId: z.string().uuid().optional(),
});

// GET /api/teams?center=&centerDayId= — admin: all teams; jury: teams of their pools
router.get("/", authenticate, asyncRoute(async (req, res) => {
  const { center, centerDayId } = ListQuery.parse(req.query);
  const user = req.user!;

  const where: Prisma.TeamWhereInput = {
    ...(center ? { center } : {}),
    ...(centerDayId ? { centerDayId } : {}),
    ...(user.role === "jury" ? { id: { in: await juryTeamIds(user.id) } } : {}),
  };

  res.json(await db.team.findMany({
    where,
    include: teamInclude,
    orderBy: [{ center: "asc" }, { name: "asc" }],
  }));
}));

// GET /api/teams/:id
router.get("/:id", authenticate, asyncRoute(async (req, res) => {
  const user = req.user!;
  if (user.role === "jury" && !(await juryTeamIds(user.id)).includes(req.params.id)) {
    throw new NotFoundError("Team not found");
  }
  const team = await db.team.findUnique({ where: { id: req.params.id }, include: teamInclude });
  if (!team) throw new NotFoundError("Team not found");
  res.json(team);
}));

// PUT /api/teams/:id/day — { centerDayId | null }: pick the one day a team plays
router.put("/:id/day", ...adminOnly, asyncRoute(async (req, res) => {
  const { centerDayId } = z.object({ centerDayId: z.string().uuid().nullable() }).parse(req.body);

  const team = await db.team.findUnique({ where: { id: req.params.id } });
  if (!team) throw new NotFoundError("Team not found");

  const day = centerDayId ? await db.centerDay.findUnique({ where: { id: centerDayId } }) : null;
  if (centerDayId) {
    if (!day) throw new NotFoundError("Center day not found");
    if (day.center !== team.center) {
      throw new BadRequestError("Ce jour n'appartient pas au centre de l'équipe");
    }
  }
  if (centerDayId !== team.centerDayId && (await isTeamInPool(team.id))) {
    throw new ConflictError("L'équipe est déjà dans une poule — refaites le tirage de son jour d'abord");
  }

  const updated = await db.$transaction(async (tx) => {
    const saved = await tx.team.update({ where: { id: team.id }, data: { centerDayId }, include: teamInclude });
    if (centerDayId !== team.centerDayId) {
      await audit(tx, req.user!, {
        category: "Équipes",
        action: "team.day",
        summary: day ? `${team.quadrigram} jouera le ${day.date} (${centerName(day.center)})` : `${team.quadrigram} repasse sans jour`,
      });
    }
    return saved;
  });
  res.json(updated);
}));

export default router;
