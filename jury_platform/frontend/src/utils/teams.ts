import type { Passage, PoolDetails, Team } from "@/types";

export function hasFinalReport(team: Team | undefined, problemNumber: number): boolean {
  return Boolean(team?.reports.some((r) => r.problemNumber === problemNumber));
}

// Where a problem sits in the team's ranking of the problems it wants to
// defend: 1 for its favorite, a problem left out of a partial ranking after
// the ranked ones (as the draw counts it). Null when the team gave none.
export function choiceRank(team: Team | undefined, problemNumber: number): number | null {
  const ranking = team?.problemRanking ?? [];
  if (ranking.length === 0) return null;
  const index = ranking.indexOf(problemNumber);
  return (index === -1 ? ranking.length : index) + 1;
}

export const ordinal = (n: number) => (n === 1 ? "1ᵉʳ" : `${n}ᵉ`);

function teamsOfPassage(p: Passage): string[] {
  return [p.defenderTeamId, p.opponentTeamId, p.reporterTeamId, ...(p.extraTeamId ? [p.extraTeamId] : [])];
}

// Teams already placed in a drawn pool — their day can no longer change.
export function drawnTeamIds(pools: PoolDetails[]): Set<string> {
  return new Set(pools.flatMap((pool) => pool.passages.flatMap(teamsOfPassage)));
}
