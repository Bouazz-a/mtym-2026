// Constraint-report types of the finale draw (see generateBothRoundsOptimal
// in tournamentOptimizer.ts). Not used by the qualifications.

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
