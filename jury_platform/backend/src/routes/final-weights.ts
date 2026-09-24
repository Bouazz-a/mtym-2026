import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { QUALIFS_PROBLEMS } from "../algorithms/poolDraw";
import { adminOnly } from "../middleware/auth";
import { audit } from "../services/audit";
import { asyncRoute, BadRequestError } from "../utils/errors";

// The final grade's weights: a team's final grade is the weighted average of
// its defence, opposition, reporter and written-report notes. The written
// report is itself the weighted average of the team's reports (each out of
// 20), with a weight per problem in %. One row.
const router = Router();
router.use(...adminOnly);

const PARTS = ["defender", "opponent", "reporter", "report"] as const;
const NAMES = { defender: "Défense", opponent: "Opposition", reporter: "Rapporteur", report: "Rapport écrit" } as const;

// { "1": 25, "2": 25, … } — every problem, adding up to 100 %
const ProblemWeightsSchema = z
  .record(z.string(), z.number().min(0))
  .refine((w) => QUALIFS_PROBLEMS.every((p) => w[String(p)] !== undefined), "Un poids par problème")
  .refine((w) => Math.abs(QUALIFS_PROBLEMS.reduce((s, p) => s + w[String(p)], 0) - 100) < 0.01, "Les poids des problèmes doivent faire 100 %");

// Either the four parts, the problem weights, or both
const BodySchema = z.object({
  defender: z.number().min(0).optional(),
  opponent: z.number().min(0).optional(),
  reporter: z.number().min(0).optional(),
  report: z.number().min(0).optional(),
  problemWeights: ProblemWeightsSchema.optional(),
});

type ProblemWeights = Record<string, number>;

const findWeights = () => db.finalWeights.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

// GET /api/final-weights
router.get("/", asyncRoute(async (_req, res) => {
  const { id: _id, ...weights } = await findWeights();
  res.json(weights);
}));

// PUT /api/final-weights — { defender, opponent, reporter, report } and/or { problemWeights }
router.put("/", asyncRoute(async (req, res) => {
  const body = BodySchema.parse(req.body);
  const { id: _id, ...before } = await findWeights();
  const data = {
    ...Object.fromEntries(PARTS.map((k) => [k, body[k] ?? before[k]])) as Record<(typeof PARTS)[number], number>,
    problemWeights: (body.problemWeights ?? before.problemWeights) as ProblemWeights,
  };
  if (PARTS.every((k) => data[k] === 0)) throw new BadRequestError("Au moins un coefficient doit être positif");

  const changed = PARTS.filter((k) => before[k] !== data[k]);
  const beforeProblems = before.problemWeights as ProblemWeights;
  const changedProblems = QUALIFS_PROBLEMS.map(String).filter((p) => beforeProblems[p] !== data.problemWeights[p]);
  await db.$transaction(async (tx) => {
    await tx.finalWeights.update({ where: { id: 1 }, data });
    if (changed.length) {
      await audit(tx, req.user!, {
        category: "Note finale",
        action: "weights.update",
        summary: `Coefficients de la note finale : ${changed.map((k) => `${NAMES[k]} ${before[k]} devient ${data[k]}`).join(", ")}`,
        details: {
          before: Object.fromEntries(PARTS.map((k) => [NAMES[k], before[k]])),
          after: Object.fromEntries(PARTS.map((k) => [NAMES[k], data[k]])),
        },
      });
    }
    if (changedProblems.length) {
      await audit(tx, req.user!, {
        category: "Note finale",
        action: "weights.problems",
        summary: `Poids des problèmes dans le rapport écrit : ${changedProblems.map((p) => `P${p} ${beforeProblems[p]} % devient ${data.problemWeights[p]} %`).join(", ")}`,
        details: { before: beforeProblems, after: data.problemWeights },
      });
    }
  });
  res.json(data);
}));

export default router;
