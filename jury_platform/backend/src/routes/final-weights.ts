import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly } from "../middleware/auth";
import { audit } from "../services/audit";

// The final grade's weights: a team's final grade is the weighted average of
// its defence, opposition, reporter and written-report notes. One row.
const router = Router();
router.use(...adminOnly);

const WeightsSchema = z
  .object({
    defender: z.number().min(0),
    opponent: z.number().min(0),
    reporter: z.number().min(0),
    report: z.number().min(0),
  })
  .refine((w) => w.defender + w.opponent + w.reporter + w.report > 0, "Au moins un coefficient doit être positif");

const NAMES = { defender: "Défense", opponent: "Opposition", reporter: "Rapporteur", report: "Rapport écrit" } as const;

const findWeights = () => db.finalWeights.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

// GET /api/final-weights
router.get("/", async (_req, res, next) => {
  try {
    const { id: _id, ...weights } = await findWeights();
    res.json(weights);
  } catch (err) { next(err); }
});

// PUT /api/final-weights — { defender, opponent, reporter, report }
router.put("/", async (req, res, next) => {
  try {
    const data = WeightsSchema.parse(req.body);
    const { id: _id, ...before } = await findWeights();
    const changed = (Object.keys(NAMES) as (keyof typeof NAMES)[]).filter((k) => before[k] !== data[k]);
    await db.$transaction(async (tx) => {
      await tx.finalWeights.update({ where: { id: 1 }, data });
      if (changed.length) {
        await audit(tx, req.user!, {
          category: "Note finale",
          action: "weights.update",
          summary: `Coefficients de la note finale : ${changed.map((k) => `${NAMES[k]} ${before[k]} devient ${data[k]}`).join(", ")}`,
          details: {
            before: Object.fromEntries(Object.entries(NAMES).map(([k, name]) => [name, before[k as keyof typeof NAMES]])),
            after: Object.fromEntries(Object.entries(NAMES).map(([k, name]) => [name, data[k as keyof typeof NAMES]])),
          },
        });
      }
    });
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
