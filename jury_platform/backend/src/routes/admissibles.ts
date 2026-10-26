import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly } from "../middleware/auth";
import { audit } from "../services/audit";
import { applyAdmissibles, planAdmissibles, type AdmissiblesImpact } from "../services/admissibles";
import { asyncRoute, BadRequestError, NotFoundError } from "../utils/errors";

// The list of admissible teams (services/admissibles.ts). The interface
// ranks the teams and sends the list it shows; this stores it and sorts out
// the reports already handed out. One row, none until the list is fixed.
const router = Router();
router.use(...adminOnly);

const TeamIdsSchema = z
  .array(z.string().uuid())
  .min(1, "La liste est vide")
  .refine((ids) => new Set(ids).size === ids.length, "Une équipe apparaît deux fois");

const ListSchema = z.object({
  places: z.number().int().min(1).max(1000),
  lambda: z.number().positive(),
  teamIds: TeamIdsSchema, // in the order of the ranking
});

async function assertTeams(teamIds: string[]) {
  const known = await db.team.count({ where: { id: { in: teamIds } } });
  if (known !== teamIds.length) throw new BadRequestError("Certaines équipes n'existent plus : rechargez la page");
}

// λ max = the teams that played over n: λ × n can't ask for more teams than
// there are (frontend lib/services/admissibility.ts, lambdaMax)
async function assertLambda(places: number, lambda: number) {
  const played = await db.team.count({
    where: { OR: [{ defended: { some: {} } }, { opposed: { some: {} } }, { reported: { some: {} } }] },
  });
  if (lambda * places > played + 1e-9) {
    const max = String(Math.round((played / places) * 100) / 100).replace(".", ",");
    throw new BadRequestError(`λ vaut au plus ${played} / ${places}, soit ${max} : ${played} équipes ont joué`);
  }
}

// "BAKA P2 (Ines Uitest)"
const reportName = (r: { team: string; problemNumber: number; juror: string }) => `${r.team} P${r.problemNumber} (${r.juror})`;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

// GET /api/admissibles — the list, or null
router.get("/", asyncRoute(async (_req, res) => {
  res.json(await db.admissibleList.findUnique({ where: { id: 1 } }));
}));

// POST /api/admissibles/preview — { teamIds }: what fixing this list would do
// to the reports already handed out, nothing saved
router.post("/preview", asyncRoute(async (req, res) => {
  const { teamIds } = z.object({ teamIds: TeamIdsSchema }).parse(req.body);
  await assertTeams(teamIds);
  res.json(await planAdmissibles(db, teamIds));
}));

// PUT /api/admissibles — { places, lambda, teamIds }: fixes the list (or
// replaces it), and takes back from their jurors the other teams' reports
// not graded yet
router.put("/", asyncRoute(async (req, res) => {
  const { places, lambda, teamIds } = ListSchema.parse(req.body);
  await assertTeams(teamIds);
  await assertLambda(places, lambda);
  const quads = new Map((await db.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, quadrigram: true } })).map((t) => [t.id, t.quadrigram]));
  const fixedBy = `${req.user!.firstName} ${req.user!.lastName}`;

  const { list, impact } = await db.$transaction(async (tx) => {
    const impact: AdmissiblesImpact = await planAdmissibles(tx, teamIds);
    const data = { places, lambda, teamIds, fixedAt: new Date(), fixedBy };
    const list = await tx.admissibleList.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    await applyAdmissibles(tx, impact);
    await audit(tx, req.user!, {
      category: "Sélection",
      action: "admissibles.fix",
      summary: `Liste des admissibles arrêtée : ${plural(teamIds.length, "équipe")} (n = ${places}, λ = ${String(lambda).replace(".", ",")})`
        + (impact.takenBack.length ? ` ; ${plural(impact.takenBack.length, "rapport")} repris à leurs jurés` : "")
        + (impact.keptGraded.length ? ` ; ${plural(impact.keptGraded.length, "rapport")} déjà corrigé${impact.keptGraded.length > 1 ? "s" : ""} compté${impact.keptGraded.length > 1 ? "s" : ""} 0` : ""),
      details: {
        admissibles: teamIds.map((id) => quads.get(id) ?? "?"),
        "rapports repris": impact.takenBack.map(reportName),
        "corrigés, comptés 0": impact.keptGraded.map(reportName),
      },
    });
    return { list, impact };
  }, { timeout: 20_000 });
  res.json({ list, impact });
}));

// DELETE /api/admissibles — reopens the list: every report counts again. The
// reports taken back aren't handed back by themselves (« Compléter » on
// Affectation des rapports does it).
router.delete("/", asyncRoute(async (req, res) => {
  const list = await db.admissibleList.findUnique({ where: { id: 1 } });
  if (!list) throw new NotFoundError("Aucune liste arrêtée");
  await db.$transaction(async (tx) => {
    await tx.admissibleList.delete({ where: { id: 1 } });
    await audit(tx, req.user!, {
      category: "Sélection",
      action: "admissibles.reopen",
      summary: `Liste des admissibles rouverte (${plural(list.teamIds.length, "équipe")}, arrêtée par ${list.fixedBy})`,
    });
  });
  res.status(204).send();
}));

export default router;
