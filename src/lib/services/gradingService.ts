import type { Criterion, PassageRole } from "@/types";
import {
  getCriteria,
  getReportGradesByEvaluation,
  getOralGradesByEvaluation,
} from "@/lib/repositories/evaluationRepository";

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

/** Criteria configured for a final-report problem. */
export function reportCriteria(problemNumber: number): Criterion[] {
  return getCriteria()
    .filter((c) => c.type === "report" && c.problemNumber === problemNumber)
    .sort((a, b) => a.order - b.order);
}

/** Criteria configured for an oral passage role. */
export function oralCriteria(role: PassageRole): Criterion[] {
  return getCriteria()
    .filter((c) => c.type === "oral" && c.role === role)
    .sort((a, b) => a.order - b.order);
}

/** Weighted note of a saved final-report evaluation. */
export function reportNote(
  evaluationId: string,
  problemNumber: number,
): NoteBreakdown {
  return weightedNote(getReportGradesByEvaluation(evaluationId), reportCriteria(problemNumber));
}

/** Weighted note of a saved oral (passage) evaluation. */
export function oralNote(evaluationId: string, role: PassageRole): NoteBreakdown {
  return weightedNote(getOralGradesByEvaluation(evaluationId), oralCriteria(role));
}

/** Round a note to 2 decimals for display. */
export function fmtNote(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}
