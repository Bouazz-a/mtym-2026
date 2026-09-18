import type { PassageRole } from "@prisma/client";

export interface Lineup {
  defenderTeamId: string;
  opponentTeamId: string;
  reporterTeamId: string;
  extraTeamId?: string | null;
}

// Every team playing in the passage (the observer included, when there is one).
export function teamsOf(p: Lineup): string[] {
  return [p.defenderTeamId, p.opponentTeamId, p.reporterTeamId, ...(p.extraTeamId ? [p.extraTeamId] : [])];
}

export function roleOf(p: Lineup, teamId: string): PassageRole | null {
  if (p.defenderTeamId === teamId) return "defender";
  if (p.opponentTeamId === teamId) return "opponent";
  if (p.reporterTeamId === teamId) return "reporter";
  if (p.extraTeamId === teamId) return "extra";
  return null;
}
