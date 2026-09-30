import type { Criterion, PassageRole } from "@/types";

// gradingService — pure computation of weighted notes from criteria and
// per-criterion grades. The "score" of a grade is a 0..1 success rate
// (taux de réussite); a criterion carries an arbitrary coefficient (may be
// negative, e.g. a malus). The note of a criterion is score × coefficient,
// and an evaluation's note is the sum over all its criteria.

interface NoteBreakdown {
  /** Σ score × coefficient over the criteria that have been graded. */
  total: number;
  /** Σ coefficient over all positive-coefficient criteria — the reference max. */
  maxTotal: number;
}

/** Weighted note for a set of grades against a set of criteria. */
export function weightedNote(
  grades: { criterionId: string; score: number }[],
  criteria: Criterion[],
): NoteBreakdown {
  const byId = new Map(criteria.map((c) => [c.id, c]));
  let total = 0;
  for (const g of grades) {
    const c = byId.get(g.criterionId);
    if (c) total += g.score * c.coefficient;
  }
  const maxTotal = criteria.reduce((s, c) => s + Math.max(c.coefficient, 0), 0);
  return { total, maxTotal };
}

// The grid of a report problem / an oral role, in display order.
export function reportCriteria(criteria: Criterion[], problemNumber: number): Criterion[] {
  return criteria.filter((c) => c.type === "report" && c.problemNumber === problemNumber).sort((a, b) => a.order - b.order);
}

export function oralCriteria(criteria: Criterion[], role: PassageRole): Criterion[] {
  return criteria.filter((c) => c.type === "oral" && c.role === role).sort((a, b) => a.order - b.order);
}

/** Round a note to 2 decimals for display. */
export function fmtNote(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/** A note as the jurors read it: French decimal comma, true minus sign ("−1,25"). */
export function frNote(n: number): string {
  return fmtNote(n).replace(".", ",").replace(/^-/, "−");
}

/** A success rate as typed ("0,1", "0.1", ".5"): between 0 and 1, to the
 *  hundredth; null while it isn't a number yet. */
export function parseRate(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "" || text === ".") return null;
  const v = Number(text);
  if (Number.isNaN(v)) return null;
  return Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
}
