// Pool draws of the qualifications — pure computation: no database, no
// HTTP. The draw routes (routes/draws.ts) call it and save the result after
// re-checking it with validateDraw.
//
// One round per center day: pools of 4 (3 when the team count requires it),
// every team defends once, problems drawn at random without repeats inside
// a pool, passage n of every pool in the day's slot n (pools in parallel).
// The finale (finaleDraw.ts) builds its first round with the same bricks.

// The qualifications' problems. The frontend has its own copy for its menus
// (QUALIFS_PROBLEMS in frontend/src/utils/labels.ts): keep them equal.
export const QUALIFS_PROBLEMS = [1, 2, 3, 4];

export interface DrawnPassage {
  label: string; // "CAS-A1P2"
  slot: number; // 1..n — the day's time slot
  problemNumber: number;
  defenderTeamId: string;
  opponentTeamId: string;
  reporterTeamId: string;
  extraTeamId: string | null; // observer — pools of 4 only
}

export interface DrawnPool {
  label: string; // "CAS-A1"
  passages: DrawnPassage[];
}

// Draws the pools of one center day. What can't make a clean pool is left
// aside rather than refused (see splitForQualifs).
export function generateQualifsDay<T extends { id: string }>(args: {
  teams: T[];
  labelPrefix: string; // "CAS-A" -> pools CAS-A1, CAS-A2…
  labelStart?: number; // first pool number, to continue an existing series
  problemPool?: number[];
}): { pools: DrawnPool[]; leftover: T[] } {
  const { groups, leftover } = splitForQualifs(shuffle(args.teams));
  const start = args.labelStart ?? 1;
  const pools = buildRound(groups, args.problemPool ?? QUALIFS_PROBLEMS, (idx) => `${args.labelPrefix}${idx + start}`);
  return { pools, leftover };
}

// Pools of 4, then of 3, and what's left aside. A team that can't make a
// clean pool isn't a failure: it may simply not come, and its pool mates
// are then moved to the online tournament by hand. Out of 5 teams only 4
// can play — 3 + 2 would leave a pool of two.
export function splitForQualifs<T>(teams: T[]): { groups: T[][]; leftover: T[] } {
  const playable = teams.length < 3 ? 0 : teams.length === 5 ? 4 : teams.length;
  const groups: T[][] = [];
  let taken = 0;
  for (const size of playable === 0 ? [] : computePoolBuckets(playable, 4)) {
    groups.push(teams.slice(taken, taken + size));
    taken += size;
  }
  return { groups, leftover: teams.slice(taken) };
}

// One pool per group of teams, in rotation: in passage i, team i defends,
// i+1 opposes, i+2 reports and (in a pool of 4) i+3 observes.
export function buildRound(
  groups: { id: string }[][],
  problemPool: number[],
  poolLabel: (index: number) => string,
): DrawnPool[] {
  return groups.map((teams, index) => {
    const label = poolLabel(index);
    const n = teams.length;
    const problems = randomSample(problemPool, n);
    return {
      label,
      passages: teams.map((_, i) => ({
        label: `${label}P${i + 1}`,
        slot: i + 1,
        problemNumber: problems[i],
        defenderTeamId: teams[i].id,
        opponentTeamId: teams[(i + 1) % n].id,
        reporterTeamId: teams[(i + 2) % n].id,
        extraTeamId: n === 4 ? teams[(i + 3) % n].id : null,
      })),
    };
  });
}

// Pool sizes for `totalTeams`, as close to `preferredSize` (3 or 4) as the
// count allows.
export function computePoolBuckets(totalTeams: number, preferredSize: number): number[] {
  const buckets: number[] = [];

  if (preferredSize === 3) {
    const numThrees = Math.floor(totalTeams / 3);
    const remainder = totalTeams % 3;
    for (let i = 0; i < numThrees; i++) buckets.push(3);
    if (remainder === 1 && buckets.length >= 2) {
      buckets.pop();
      buckets.push(4);
    } else if (remainder === 2 && buckets.length >= 1) {
      buckets.pop();
      buckets.pop();
      buckets.push(4);
      buckets.push(4);
    }
    return buckets;
  }

  let numFours = Math.floor(totalTeams / 4);
  const remainder = totalTeams % 4;

  if (remainder === 0) {
    for (let i = 0; i < numFours; i++) buckets.push(4);
  } else if (remainder === 3) {
    for (let i = 0; i < numFours; i++) buckets.push(4);
    buckets.push(3);
  } else if (remainder === 2) {
    numFours -= 1;
    for (let i = 0; i < numFours; i++) buckets.push(4);
    buckets.push(3);
    buckets.push(3);
  } else if (remainder === 1) {
    if (numFours < 2) throw new Error(`Impossible de former des poules de 3 ou 4 avec ${totalTeams} équipes`);
    numFours -= 2;
    for (let i = 0; i < numFours; i++) buckets.push(4);
    buckets.push(3);
    buckets.push(3);
    buckets.push(3);
  }

  return buckets;
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomSample<T>(arr: readonly T[], n: number): T[] {
  if (n > arr.length) throw new Error("Pas assez de problèmes pour cette poule");
  return shuffle(arr).slice(0, n);
}
