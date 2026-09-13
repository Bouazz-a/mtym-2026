import type { Criterion } from "@/types";

// gradingService — pure computation of weighted notes from criteria and
// per-criterion grades. The "score" of a grade is a 0..1 success rate
// (taux de réussite); a criterion carries an arbitrary coefficient (may be
// negative, e.g. a malus). The note of a criterion is score × coefficient,
// and an evaluation's note is the sum over all its criteria.
//
// Nothing here is hardcoded to a particular set of criteria: feed it the
// criteria currently configured and it adapts. This keeps the UI a thin
// shell over a backend-shaped computation.

export interface NoteBreakdown {
  /** Σ score × coefficient over the criteria that have been graded. */
  total: number;
  /** Σ coefficient over all positive-coefficient criteria — the reference max. */
  maxTotal: number;
  /** How many criteria carry a grade. */
  gradedCount: number;
  /** How many criteria exist for this scope. */
  criterionCount: number;
}

export interface ScoredGrade {
  criterionId: string;
  score: number;
}

/** Weighted note for a set of grades against a set of criteria. */
export function weightedNote(
  grades: ScoredGrade[],
  criteria: Criterion[],
): NoteBreakdown {
  const byId = new Map(criteria.map((c) => [c.id, c]));
  let total = 0;
  let gradedCount = 0;
  for (const g of grades) {
    const c = byId.get(g.criterionId);
    if (!c) continue;
    total += g.score * c.coefficient;
    gradedCount++;
  }
  const maxTotal = criteria.reduce(
    (s, c) => s + Math.max(c.coefficient, 0),
    0,
  );
  return { total, maxTotal, gradedCount, criterionCount: criteria.length };
}

// Filtering which criteria apply to a report problem / oral role is pure
// computation over an already-fetched list — see filterReportCriteria /
// filterOralCriteria in evaluationRepository.ts, which fetch the list from
// the backend and do the same filtering. Kept here only as thin re-exports
// so existing callers don't need two import sources.
export { filterReportCriteria as reportCriteria, filterOralCriteria as oralCriteria } from "@/lib/repositories/evaluationRepository";

/**
 * Weighted note of a saved evaluation. The backend now returns an
 * evaluation's grades nested on the object itself (ReportEvaluationWithGrades
 * / OralEvaluationWithGrades — see evaluationRepository.ts), so callers pass
 * that `grades` array directly instead of an evaluation id to look up.
 */
export function evaluationNote(
  grades: ScoredGrade[],
  criteria: Criterion[],
): NoteBreakdown {
  return weightedNote(grades, criteria);
}

/** Round a note to 2 decimals for display. */
export function fmtNote(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}
