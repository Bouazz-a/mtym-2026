import { apiFetch } from "@/lib/api/client";

// Constraint-report types + read access, split out of tournamentOptimizer.ts
// so pages that only need to *display* the report (e.g. ParcoursPage) don't
// have to pull in the rest of that file's round-generation code, which
// isn't converted to the real backend yet.

export type ConstraintCode = "OO" | "OD" | "OR" | "DO" | "DR";
export type Round1Role = "defended" | "opposed" | "reported";
export type Round2Role = "defender" | "opponent" | "reporter";

export interface ConstraintViolation {
  code: ConstraintCode;
  weight: number;
  teamId: string;
  teamQuad: string;
  problemNumber: number;
  round2: { poolLabel: string; passageLabel: string; role: Round2Role };
  round1: { poolLabel: string; passageLabel: string; role: Round1Role };
}

export interface ConstraintReport {
  generatedAt: string;
  totalScore: number;
  violations: ConstraintViolation[];
}

// GET /api/constraint-report returns the latest report (or null) in
// exactly this shape.
export function getConstraintReport(): Promise<ConstraintReport | null> {
  return apiFetch<ConstraintReport | null>("/constraint-report");
}
