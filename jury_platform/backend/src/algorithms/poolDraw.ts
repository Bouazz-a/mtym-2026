// Pool draws of the qualifications — pure computation: no database, no
// HTTP. The draw routes (routes/draws.ts) call it and save the result after
// re-checking it with validateDraw.
//
// One round per center day: pools of 4 (3 when the team count requires it),
// every team defends once, problems without repeats inside a pool, passage
// n of every pool in the day's slot n (pools in parallel). In two steps:
//   1. the problem of every passage (spreadProblems): the 4 problems
//      defended equally often over the day, and the passages of a slot
//      playing problems as different as possible — a specialized jury duo
//      then finds a passage of its problem in every slot;
//   2. which team defends which of those passages (seatByRanking): as close
//      to each team's ranking of the problems as the first step allows. The
//      pools themselves come out of this seating.
// The finale (finaleDraw.ts) builds its first round with the same bricks.

import { minCostAssignment } from "./hungarian";

// The qualifications' problems. The frontend has its own copy for its menus
// (QUALIFS_PROBLEMS in frontend/src/utils/labels.ts): keep them equal.
export const QUALIFS_PROBLEMS = [1, 2, 3, 4];

// What defending its 1st…4th choice costs a team; the draw minimizes the
// sum. Not squares on purpose: a 1st + a 4th choice (5) beat two 3rd
// choices (6), while two 2nd choices (2) still beat a 1st + a 3rd (3).
export const CHOICE_COST = [0, 1, 3, 5];

// A team without a ranking has no preference; a problem left out of a
// partial ranking comes after the ranked ones.
export function choiceCost(ranking: readonly number[] | undefined, problem: number): number {
  if (!ranking || ranking.length === 0) return 0;
  const rank = ranking.indexOf(problem);
  return CHOICE_COST[Math.min(rank === -1 ? ranking.length : rank, CHOICE_COST.length - 1)];
}

// How many of the day's passages play each problem in each slot, keyed
// "slot:problem". spreadProblems reads and updates it.
export type SlotLoad = Map<string, number>;

const loadKey = (slot: number, problem: number) => `${slot}:${problem}`;

export function slotLoad(passages: { slot: number; problemNumber: number }[]): SlotLoad {
  const load: SlotLoad = new Map();
  for (const p of passages) load.set(loadKey(p.slot, p.problemNumber), (load.get(loadKey(p.slot, p.problemNumber)) ?? 0) + 1);
  return load;
}

// Random squares tried per block, unless one is already perfect
const CANDIDATE_SQUARES = 200;
// How much more an uneven count of defenses per problem weighs than a
// repeated problem in a slot: the counts come first
const COUNT_WEIGHT = 1000;

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
// only partial in one block.
//
// Each block keeps, among random squares, the one that best evens out how
// many times each problem is defended over the day (a pool of 3 leaves one
// problem out: two such pools shouldn't leave out the same one), then that
// repeats the problems already in each slot the least. Counts start from
// `load` (the day's existing passages); a fresh draw ends with counts within
// one of each other. Updates `load`.
export function spreadProblems(sizes: number[], problemPool: number[], load: SlotLoad): number[][] {
  if (sizes.some((n) => n > problemPool.length)) throw new Error("Pas assez de problèmes pour cette poule");
  const m = problemPool.length;
  const order = sizes.map((size, index) => ({ size, index })).sort((a, b) => b.size - a.size);
  const problems: number[][] = new Array(sizes.length);

  // How many passages defend each problem so far
  const defended = new Map(problemPool.map((p) => [p, 0]));
  for (const [key, n] of load) {
    const problem = Number(key.split(":")[1]);
    if (defended.has(problem)) defended.set(problem, defended.get(problem)! + n);
  }

  for (let start = 0; start < order.length; start += m) {
    const block = order.slice(start, start + m);
    const rows = (square: number[][]) => block.map(({ size }, row) => square[row].slice(0, size));
    const cost = (square: number[][]) => {
      const counts = new Map(defended);
      let repeats = 0;
      for (const row of rows(square)) {
        row.forEach((p, i) => {
          counts.set(p, counts.get(p)! + 1);
          repeats += load.get(loadKey(i + 1, p)) ?? 0;
        });
      }
      return COUNT_WEIGHT * (Math.max(...counts.values()) - Math.min(...counts.values())) + repeats;
    };

    let best = randomLatinSquare(problemPool);
    let bestCost = cost(best);
    for (let k = 1; k < CANDIDATE_SQUARES && bestCost > 0; k++) {
      const square = randomLatinSquare(problemPool);
      const c = cost(square);
      if (c < bestCost) [best, bestCost] = [square, c];
    }
    rows(best).forEach((row, r) => {
      problems[block[r].index] = row;
      row.forEach((p, i) => {
        load.set(loadKey(i + 1, p), (load.get(loadKey(i + 1, p)) ?? 0) + 1);
        defended.set(p, defended.get(p)! + 1);
      });
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

export interface RankedTeam {
  id: string;
  problemRanking?: readonly number[]; // favorite problem first; empty = no preference
}

// Draws the pools of one center day. What can't make a clean pool is left
// aside rather than refused (see splitForQualifs). `taken`: the passages the
// day already has (completing a draw), which the new pools balance against.
export function generateQualifsDay<T extends RankedTeam>(args: {
  teams: T[];
  labelPrefix: string; // "CAS-A" -> pools CAS-A1, CAS-A2…
  labelStart?: number; // first pool number, to continue an existing series
  problemPool?: number[];
  taken?: { slot: number; problemNumber: number }[];
}): { pools: DrawnPool[]; leftover: T[] } {
  const { groups, leftover } = splitForQualifs(shuffle(args.teams));
  const sizes = groups.map((g) => g.length);
  const problems = spreadProblems(sizes, args.problemPool ?? QUALIFS_PROBLEMS, slotLoad(args.taken ?? []));
  const start = args.labelStart ?? 1;
  const pools = seatByRanking(problems, groups.flat()).map((teams, index) =>
    rotation(`${args.labelPrefix}${index + start}`, teams, problems[index]));
  return { pools, leftover };
}

// Far below the gap between two choice costs: it only decides between
// equally good seatings, which keeps the pools random among them.
const TIE_NOISE = 1e-4;

// Seats the teams in the pools: the team seated at (pool k, slot i) defends
// problems[k][i]. One min-cost assignment of teams to seats, costed by each
// team's ranking (choiceCost). Returns each pool's teams, slot 1 first.
export function seatByRanking<T extends RankedTeam>(problems: number[][], teams: T[]): T[][] {
  const seats = problems.flatMap((row, pool) => row.map((problem, slot) => ({ pool, slot, problem })));
  if (seats.length !== teams.length) throw new Error(`${teams.length} équipes pour ${seats.length} places dans les poules`);
  const cost = teams.map((team) => seats.map((seat) => choiceCost(team.problemRanking, seat.problem) + Math.random() * TIE_NOISE));
  const pools: T[][] = problems.map((row) => new Array(row.length));
  minCostAssignment(cost).forEach((seat, team) => {
    pools[seats[seat].pool][seats[seat].slot] = teams[team];
  });
  return pools;
}

// A pool's passages, in rotation: in passage i, team i defends problems[i],
// i+1 opposes, i+2 reports and (in a pool of 4) i+3 observes.
function rotation(label: string, teams: { id: string }[], problems: number[]): DrawnPool {
  const n = teams.length;
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

// One pool per group of teams, as given (no rankings), in rotation. The
// pools' problems are spread across each slot (spreadProblems), starting
// from `load`. The finale's first round.
export function buildRound(
  groups: { id: string }[][],
  problemPool: number[],
  poolLabel: (index: number) => string,
  load: SlotLoad = new Map(),
): DrawnPool[] {
  const poolProblems = spreadProblems(groups.map((g) => g.length), problemPool, load);
  return groups.map((teams, index) => rotation(poolLabel(index), teams, poolProblems[index]));
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
