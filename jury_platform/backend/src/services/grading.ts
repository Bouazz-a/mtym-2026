import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { BadRequestError } from "../utils/errors";

// score is a success rate (taux de réussite) in 0..1; the note of a
// criterion is score × coefficient.
export const GradesSchema = z
  .array(z.object({
    criterionId: z.string().uuid(),
    score: z.number().min(0).max(1),
    remark: z.string().optional(),
  }))
  .optional();

// Rejects grades whose criterion doesn't belong to the grid being filled
// (e.g. an opponent criterion sent for the defender, or problem 2's grid
// for a problem-3 report).
export async function assertCriteriaApply(
  tx: Prisma.TransactionClient,
  criterionIds: string[],
  grid: Prisma.CriterionWhereInput,
): Promise<void> {
  if (!criterionIds.length) return;
  const matching = await tx.criterion.count({ where: { ...grid, id: { in: criterionIds } } });
  if (matching !== new Set(criterionIds).size) {
    throw new BadRequestError("Certains critères ne correspondent pas à cette grille");
  }
}

// ─── A juror's note, as the journal writes it ─────────────────────────
// Admins may correct or remove a juror's note (routes/oral-evaluations.ts,
// routes/report-evaluations.ts): the journal keeps what the note was.

type GridCriterion = { id: string; label: string; coefficient: number };
type SavedGrade = { criterionId: string; score: number; remark?: string | null };

// "12,5": French decimal comma, two decimals at most
export const frNumber = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

// Σ score × coefficient over the grid, out of the grid's maximum (Σ positive
// coefficients), or brought back to `outOf` (written reports: 20)
export function noteOf(grades: SavedGrade[], criteria: GridCriterion[], outOf?: number): { total: number; max: number } {
  const coefficient = new Map(criteria.map((c) => [c.id, c.coefficient]));
  const total = grades.reduce((s, g) => s + g.score * (coefficient.get(g.criterionId) ?? 0), 0);
  const max = criteria.reduce((s, c) => s + Math.max(c.coefficient, 0), 0);
  return outOf && max > 0 ? { total: (total / max) * outOf, max: outOf } : { total, max };
}

// The whole note, for the journal's details: enough to type it again
export function noteDetails(
  evaluation: { globalRemark: string | null; grades: SavedGrade[] },
  criteria: GridCriterion[],
  outOf?: number,
) {
  const { total, max } = noteOf(evaluation.grades, criteria, outOf);
  const grade = new Map(evaluation.grades.map((g) => [g.criterionId, g]));
  return {
    note: `${frNumber(total)} sur ${frNumber(max)}`,
    remarque: evaluation.globalRemark ?? "",
    critères: criteria.map((c) => {
      const g = grade.get(c.id);
      return { critère: c.label, taux: g ? g.score : null, ...(g?.remark ? { remarque: g.remark } : {}) };
    }),
  };
}

// What an admin sends to correct a note: the whole grid and the remark
export const NoteEditSchema = z.object({
  globalRemark: z.string().optional(),
  grades: GradesSchema,
});
