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
