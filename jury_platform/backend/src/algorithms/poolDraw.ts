// Pool draws of the qualifications — pure computation: no database, no
// HTTP. The draw routes (routes/draws.ts) call it and save the result after
// re-checking it with validateDraw.
//
// One round per center day: pools of 4 (3 when the team count requires it),
// every team defends once, problems without repeats inside a pool, passage
// n of every pool in the day's slot n (pools in parallel). Problems are
// spread so the passages of a slot play problems as different as possible
// (pickProblems): a specialized jury duo then finds a passage of its problem
// in every slot. The finale (finaleDraw.ts) builds its first round with the
// same bricks.

// The qualifications' problems. The frontend has its own copy for its menus
// (QUALIFS_PROBLEMS in frontend/src/utils/labels.ts): keep them equal.
export const QUALIFS_PROBLEMS = [1, 2, 3, 4];

// How many of the day's passages play each problem in each slot, keyed
// "slot:problem". spreadProblems reads and updates it.
export type SlotLoad = Map<string, number>;

const loadKey = (slot: number, problem: number) => `${slot}:${problem}`;

export function slotLoad(passages: { slot: number; problemNumber: number }[]): SlotLoad {
  const load: SlotLoad = new Map();
  for (const p of passages) load.set(loadKey(p.slot, p.problemNumber), (load.get(loadKey(p.slot, p.problemNumber)) ?? 0) + 1);
  return load;
}

// Squares tried per block when the day already has passages to balance with
const CANDIDATE_SQUARES = 200;

// A random Latin square over the problems — every row and every column
// holds each problem once: a cyclic square with its rows, columns and
// symbols shuffled.
function randomLatinSquare(problems: number[]): number[][] {
  const m = problems.length;
  const [rows, cols, symbols] = [shuffle([...Array(m).keys()]), shuffle([...Array(m).keys()]), shuffle(problems)];
  return rows.map((r) => cols.map((c) => symbols[(r + c) % m]));
}

// The problems of pools of the given sizes (slot 1 first): never twice in a
// pool, and in every slot as different as possible from the other pools'.
//
// The pools go by blocks of as many pools as there are problems, each
// block one random Latin square (a row per pool, a column per slot): a full
// block plays each problem once in every slot, and the last, partial one
// never twice in the same slot, so each slot is balanced to within one
// passage. Pools of 4 go first, so slot 4 (which pools of 3 don't have) is
// only partial in one block. When the day already has passages (`load`),
// each block keeps the square that repeats them the least. Updates `load`.
export function spreadProblems(sizes: number[], problemPool: number[], load: SlotLoad): number[][] {
  if (sizes.some((n) => n > problemPool.length)) throw new Error("Pas assez de problèmes pour cette poule");
  const m = problemPool.length;
  const order = sizes.map((size, index) => ({ size, index })).sort((a, b) => b.size - a.size);
  const problems: number[][] = new Array(sizes.length);

  for (let start = 0; start < order.length; start += m) {
    const block = order.slice(start, start + m);
    const cost = (square: number[][]) =>
      block.reduce((sum, { size }, row) =>
        sum + square[row].slice(0, size).reduce((s, p, i) => s + (load.get(loadKey(i + 1, p)) ?? 0), 0), 0);

    let best = randomLatinSquare(problemPool);
    if (load.size > 0) {
      for (let k = 1; k < CANDIDATE_SQUARES && cost(best) > 0; k++) {
        const square = randomLatinSquare(problemPool);
        if (cost(square) < cost(best)) best = square;
      }
    }
    block.forEach(({ size, index }, row) => {
      problems[index] = best[row].slice(0, size);
      problems[index].forEach((p, i) => load.set(loadKey(i + 1, p), (load.get(loadKey(i + 1, p)) ?? 0) + 1));
    });
  }
  return problems;
}

// The problems of one new pool (a pool composed by hand), balanced against
// the day's existing passages
export function pickProblems(size: number, problemPool: number[], load: SlotLoad): number[] {
  return spreadProblems([size], problemPool, load)[0];
}

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
// aside rather than refused (see splitForQualifs). `taken`: the passages the
// day already has (completing a draw), which the new pools balance against.
export function generateQualifsDay<T extends { id: string }>(args: {
  teams: T[];
  labelPrefix: string; // "CAS-A" -> pools CAS-A1, CAS-A2…
  labelStart?: number; // first pool number, to continue an existing series
  problemPool?: number[];
  taken?: { slot: number; problemNumber: number }[];
}): { pools: DrawnPool[]; leftover: T[] } {
  const { groups, leftover } = splitForQualifs(shuffle(args.teams));
  const start = args.labelStart ?? 1;
  const pools = buildRound(
    groups,
    args.problemPool ?? QUALIFS_PROBLEMS,
    (idx) => `${args.labelPrefix}${idx + start}`,
    slotLoad(args.taken ?? []),
  );
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
// i+1 opposes, i+2 reports and (in a pool of 4) i+3 observes. The pools'
// problems are spread across each slot (spreadProblems), starting from `load`.
export function buildRound(
  groups: { id: string }[][],
  problemPool: number[],
  poolLabel: (index: number) => string,
  load: SlotLoad = new Map(),
): DrawnPool[] {
  const poolProblems = spreadProblems(groups.map((g) => g.length), problemPool, load);
  return groups.map((teams, index) => {
    const label = poolLabel(index);
    const n = teams.length;
    const problems = poolProblems[index];
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
