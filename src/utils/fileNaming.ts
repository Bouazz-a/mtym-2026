import type { Team, Pool, Passage } from "@/types";
/**
 * Server-side filenames.
 * Generates Document.renamedAs.
 */

export const EDITION_TAG = "MTYM2026";

// [QUAD]_RI_MTYM2026.pdf
export function getIntermediateReportFileName(team: Team): string {
  return `${team.quadrigramme}_RI_${EDITION_TAG}.pdf`;
}

// [QUAD]_RF_P[Y].pdf
export function getFinalReportFileName(
  team: Team,
  problemNumber: number,
): string {
  return `${team.quadrigramme}_RF_P${problemNumber}.pdf`;
}

// [QUAD]_FS_(Opposant|Rapporteur)_[QUAD_DEF]_[POOL]_P[Y].pdf
export function getSummarySheetFileName(args: {
  team: Team;
  role: "opponent" | "reporter";
  defendingTeam: Team;
  pool: Pool;
  passage: Passage;
}): string {
  const { team, role, defendingTeam, pool, passage } = args;
  const roleSlug = role === "opponent" ? "Opposant" : "Rapporteur";
  return `${team.quadrigramme}_FS_${roleSlug}_${defendingTeam.quadrigramme}_${pool.label}_P${passage.problemNumber}.pdf`;
}

// [QUAD]_Prez_[POOL]_P[Y].pdf
export function getPresentationFileName(args: {
  team: Team;
  pool: Pool;
  passage: Passage;
}): string {
  const { team, pool, passage } = args;
  return `${team.quadrigramme}_Prez_${pool.label}_P${passage.problemNumber}.pdf`;
}
