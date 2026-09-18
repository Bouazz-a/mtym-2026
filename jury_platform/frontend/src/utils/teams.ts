import type { Passage, PoolDetails, Team } from "@/types";

export function hasFinalReport(team: Team | undefined, problemNumber: number): boolean {
  return Boolean(team?.reports.some((r) => r.problemNumber === problemNumber));
}

function teamsOfPassage(p: Passage): string[] {
  return [p.defenderTeamId, p.opponentTeamId, p.reporterTeamId, ...(p.extraTeamId ? [p.extraTeamId] : [])];
}

// Teams already placed in a drawn pool — their day can no longer change.
export function drawnTeamIds(pools: PoolDetails[]): Set<string> {
  return new Set(pools.flatMap((pool) => pool.passages.flatMap(teamsOfPassage)));
}
