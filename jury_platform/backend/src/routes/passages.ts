import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly, authenticate } from "../middleware/auth";
import { isPassageJuror } from "../services/access";
import { audit } from "../services/audit";
import { duoInclude, duoPassageWarnings, toDuoResponse } from "../services/duos";
import { teamsOf } from "../services/passages";
import { toPoolResponse, poolInclude } from "../services/pools";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

const router = Router();

// GET /api/passages/:id — with its duo and its pool (day, sibling passages).
// A juror only gets the passages their duo judges.
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    const passage = await db.passage.findUnique({
      where: { id: req.params.id },
      include: { duo: { include: duoInclude }, pool: { include: poolInclude } },
    });
    if (!passage || (user.role === "jury" && !(await isPassageJuror(user.id, passage.id)))) {
      throw new NotFoundError("Passage not found");
    }
    const { duo, pool, ...rest } = passage;
    res.json({ ...rest, duo: duo && toDuoResponse(duo), pool: toPoolResponse(pool) });
  } catch (err) { next(err); }
});

// The room round-trips as null from a fetched passage, so null is accepted
// (and means "clear"). The time comes from the day's schedule.
const UpdateSchema = z.object({
  room: z.string().trim().nullable().optional(),
  problemNumber: z.number().int().min(1).max(4).optional(),
  defenderTeamId: z.string().uuid().optional(),
  opponentTeamId: z.string().uuid().optional(),
  reporterTeamId: z.string().uuid().optional(),
  extraTeamId: z.string().uuid().nullable().optional(),
});

// PUT /api/passages/:id — room, or a manual lineup correction. The lineup
// (problem + roles) is frozen once the passage has been graded.
router.put("/:id", ...adminOnly, async (req, res, next) => {
  try {
    const data = UpdateSchema.parse(req.body);
    const passage = await db.passage.findUnique({
      where: { id: req.params.id },
      include: { pool: { include: { passages: true } } },
    });
    if (!passage) throw new NotFoundError("Passage not found");

    const edited = { ...passage, ...data };
    const lineupChanged =
      edited.problemNumber !== passage.problemNumber ||
      teamsOf(edited).join() !== teamsOf(passage).join();

    if (lineupChanged) {
      const poolTeams = new Set(passage.pool.passages.flatMap(teamsOf));
      const teams = teamsOf(edited);
      if (new Set(teams).size !== teams.length) throw new BadRequestError("Une équipe a deux rôles");
      if (teams.some((t) => !poolTeams.has(t))) throw new BadRequestError("Toutes les équipes doivent être de cette poule");
      if ((poolTeams.size === 4) !== Boolean(edited.extraTeamId)) {
        throw new BadRequestError("L'observateur n'existe que dans les poules de 4");
      }

      const [oral, report] = await Promise.all([
        db.oralEvaluation.count({ where: { passageId: passage.id } }),
        db.reportEvaluation.count({
          where: { teamId: passage.defenderTeamId, problemNumber: passage.problemNumber },
        }),
      ]);
      if (oral + report > 0) {
        throw new ConflictError("Ce passage est déjà noté — seule la salle peut encore changer");
      }
    }

    const quads = new Map(
      (await db.team.findMany({ where: { id: { in: [...teamsOf(passage), ...teamsOf(edited)] } }, select: { id: true, quadrigram: true } }))
        .map((t) => [t.id, t.quadrigram]),
    );
    const describe = (p: typeof edited) => ({
      problème: p.problemNumber,
      défenseur: quads.get(p.defenderTeamId),
      opposant: quads.get(p.opponentTeamId),
      rapporteur: quads.get(p.reporterTeamId),
      observateur: p.extraTeamId ? quads.get(p.extraTeamId) : null,
      salle: p.room ?? null,
    });
    const [before, after] = [describe(passage), describe(edited)];
    const changed = (Object.keys(after) as (keyof typeof after)[])
      .filter((k) => before[k] !== after[k])
      .map((k) => `${k} ${before[k] ?? "vide"} devient ${after[k] ?? "vide"}`);

    const updated = await db.$transaction(async (tx) => {
      const saved = await tx.passage.update({ where: { id: passage.id }, data });
      if (changed.length) {
        await audit(tx, req.user!, {
          category: "Passages",
          action: "passage.update",
          summary: `Passage ${passage.label} : ${changed.join(", ")}`,
          details: { before, after },
        });
      }
      return saved;
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// PUT /api/passages/:id/duo — { duoId | null } -> { passage, warnings }.
// The duo must be one of the passage's day; frozen once graded.
router.put("/:id/duo", ...adminOnly, async (req, res, next) => {
  try {
    const { duoId } = z.object({ duoId: z.string().uuid().nullable() }).parse(req.body);
    const passage = await db.passage.findUnique({ where: { id: req.params.id }, include: { pool: true } });
    if (!passage) throw new NotFoundError("Passage not found");

    const duo = duoId ? await db.juryDuo.findUnique({ where: { id: duoId } }) : null;
    if (duoId) {
      if (!duo) throw new NotFoundError("Duo not found");
      if (duo.centerDayId !== passage.pool.centerDayId) {
        throw new BadRequestError("Ce duo n'est pas formé pour le jour de ce passage");
      }
    }
    const previous = passage.duoId ? await db.juryDuo.findUnique({ where: { id: passage.duoId } }) : null;

    if (duoId !== passage.duoId) {
      const [oral, report] = await Promise.all([
        db.oralEvaluation.count({ where: { passageId: passage.id } }),
        db.reportEvaluation.count({
          where: { teamId: passage.defenderTeamId, problemNumber: passage.problemNumber },
        }),
      ]);
      if (oral + report > 0) throw new ConflictError("Ce passage est déjà noté — son duo ne peut plus changer");
    }

    const updated = await db.$transaction(async (tx) => {
      const saved = await tx.passage.update({
        where: { id: passage.id },
        data: { duoId },
        include: { duo: { include: duoInclude } },
      });
      if (duoId !== passage.duoId) {
        await audit(tx, req.user!, {
          category: "Duos",
          action: "passage.duo",
          summary: duo
            ? `Duo ${duo.number} attribué à ${passage.label}${previous ? ` (à la place du duo ${previous.number})` : ""}`
            : `Duo ${previous?.number ?? "?"} retiré de ${passage.label}`,
        });
      }
      return saved;
    });
    const { duo: savedDuo, ...rest } = updated;
    res.json({
      passage: { ...rest, duo: savedDuo && toDuoResponse(savedDuo) },
      warnings: duoId ? await duoPassageWarnings(duoId) : [],
    });
  } catch (err) { next(err); }
});

export default router;
