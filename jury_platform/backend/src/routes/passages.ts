import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly, authenticate } from "../middleware/auth";
import { isPoolJuror } from "../services/access";
import { teamsOf } from "../services/passages";
import { toPoolResponse, poolInclude } from "../services/pools";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

const router = Router();

// GET /api/passages/:id — with its pool (day, jurors, sibling passages)
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    const passage = await db.passage.findUnique({
      where: { id: req.params.id },
      include: { pool: { include: poolInclude } },
    });
    if (!passage || (user.role === "jury" && !(await isPoolJuror(user.id, passage.poolId)))) {
      throw new NotFoundError("Passage not found");
    }
    res.json({ ...passage, pool: toPoolResponse(passage.pool) });
  } catch (err) { next(err); }
});

// Schedule fields round-trip as null from a fetched passage, so null is
// accepted (and means "clear").
const UpdateSchema = z.object({
  timeSlot: z.string().regex(/^\d{2}:\d{2}$/, "Heure au format HH:MM").nullable().optional(),
  room: z.string().trim().nullable().optional(),
  problemNumber: z.number().int().min(1).max(4).optional(),
  defenderTeamId: z.string().uuid().optional(),
  opponentTeamId: z.string().uuid().optional(),
  reporterTeamId: z.string().uuid().optional(),
  extraTeamId: z.string().uuid().nullable().optional(),
});

// PUT /api/passages/:id — schedule, or a manual lineup correction. The
// lineup (problem + roles) is frozen once the passage has been graded.
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
        throw new ConflictError("Ce passage est déjà noté — seuls l'heure et la salle peuvent changer");
      }
    }

    res.json(await db.passage.update({ where: { id: passage.id }, data }));
  } catch (err) { next(err); }
});

export default router;
