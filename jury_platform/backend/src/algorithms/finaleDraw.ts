// Finale draw — kept for later, not wired to any route yet. Pure
// computation, like poolDraw.ts.
//
// Two rounds. Round 1 is a plain rotation (buildRound). Round 2 regroups
// the teams to mix round-1 pools, then, for every role layout (Latin
// square) of each pool, solves "which problem in which passage" as a
// min-cost assignment. It is best-effort: it never throws when a perfect
// (score 0) plan is impossible, keeps the lowest-penalty plan it found and
// reports exactly which team breaks which soft constraint, with the round-1
// origin and round-2 occurrence of each conflict.
//
//   Code  Round 1 role      Round 2 role        Weight
//   ----  --------          --------            ------
//   DD    defended P        defends P           ABSOLUTE (forbidden)
//   OO    opposed  P        opposes P           15
//   OD    defends  P        opposes P           15
//   OR    reported P        opposes P           15
//   DO    opposed P         defends P            5
//   DR    reported P        defends P            5

import { minCostAssignment } from "./hungarian";
import { buildRound, computePoolBuckets, randomSample, shuffle, type DrawnPool } from "./poolDraw";

const MAX_ATTEMPTS = 10000;
const WEIGHT_HIGH = 15; // OO, OD, OR
const WEIGHT_LOW = 5; // DO, DR
// Forbidden (DD) cells cost far more than any real penalty, so the solver
// only picks one when no feasible matching exists (then detected and skipped).
const FORBIDDEN = 1e7;

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

export interface FinaleTeam {
  id: string;
  quadrigram: string;
}

export interface FinaleDraw {
  round1: DrawnPool[]; // pools A1, A2…
  round2: DrawnPool[]; // pools B1, B2…
  report: ConstraintReport;
}

export function generateBothRoundsOptimal(args: {
  teams: FinaleTeam[];
  poolSize?: number; // default 4; pools of 3 emerge from the team count
  problemPool: number[];
}): FinaleDraw {
  const poolSize = args.poolSize ?? 4;
  if (poolSize < 3 || poolSize > 4) throw new Error("La taille de poule doit être 3 ou 4.");
  if (args.teams.length < 3) throw new Error(`Pas assez d'équipes (${args.teams.length}) pour former une poule.`);
  if (args.problemPool.length < poolSize) {
    throw new Error(`Pas assez de problèmes (${args.problemPool.length}) pour ${poolSize} équipes par poule.`);
  }

  const round1Groups = splitIntoPools(shuffle(args.teams), poolSize);
  const round1 = buildRound(round1Groups, args.problemPool, (idx) => `A${idx + 1}`);
  const history = buildHistory(round1);
  const { pools: round2, plans } = generateRound2BestEffort(poolSize, args.problemPool, round1Groups, history);
  return { round1, round2, report: buildConstraintReport(args.teams, plans, round1, history) };
}

// ================== Round 2 ==================

interface TeamHistory {
  defended: Set<number>;
  opposed: Set<number>;
  reported: Set<number>;
}

function buildHistory(round1: DrawnPool[]): Map<string, TeamHistory> {
  const map = new Map<string, TeamHistory>();
  const ensure = (id: string): TeamHistory => {
    let h = map.get(id);
    if (!h) {
      h = { defended: new Set(), opposed: new Set(), reported: new Set() };
      map.set(id, h);
    }
    return h;
  };
  for (const p of round1.flatMap((pool) => pool.passages)) {
    ensure(p.defenderTeamId).defended.add(p.problemNumber);
    ensure(p.opponentTeamId).opposed.add(p.problemNumber);
    ensure(p.reporterTeamId).reported.add(p.problemNumber);
  }
  return map;
}

interface PassageAssignment {
  defender: FinaleTeam;
  opponent: FinaleTeam;
  reporter: FinaleTeam;
  extra: FinaleTeam | undefined;
  problem: number;
}

interface PoolPlan {
  label: string;
  passages: PassageAssignment[];
  score: number;
}

// Tries many random round-2 compositions; for each, solves every pool
// optimally and keeps the composition with the lowest total penalty.
function generateRound2BestEffort(
  poolSize: number,
  problemPool: number[],
  round1Groups: FinaleTeam[][],
  history: Map<string, TeamHistory>,
): { pools: DrawnPool[]; plans: PoolPlan[] } {
  const allTeams = round1Groups.flat();
  let bestPlans: PoolPlan[] | null = null;
  let bestTotal = Infinity;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const composition = composeRound2Pools(allTeams, poolSize, round1Groups);
    const plans: PoolPlan[] = [];
    let total = 0;
    let feasible = true;

    for (const [poolIdx, teams] of composition.entries()) {
      const solved = solvePoolOptimal(teams, randomSample(problemPool, teams.length), history);
      if (solved === null) {
        feasible = false;
        break;
      }
      total += solved.score;
      plans.push({ label: `B${poolIdx + 1}`, passages: solved.passages, score: solved.score });
    }
    if (!feasible) continue;

    if (total < bestTotal) {
      bestTotal = total;
      bestPlans = plans;
      if (total === 0) break; // can't do better than a perfect plan
    }
  }

  // Only reachable if every composition was DD-infeasible, which can't happen
  // when |problemPool| >= poolSize (Hall's theorem) — guarded all the same.
  if (bestPlans === null) throw new Error("Impossible de composer le tour 2 (contrainte absolue DD insatisfiable).");

  const pools = bestPlans.map((plan) => ({
    label: plan.label,
    passages: plan.passages.map((entry, i) => ({
      label: `${plan.label}P${i + 1}`,
      slot: i + 1,
      problemNumber: entry.problem,
      defenderTeamId: entry.defender.id,
      opponentTeamId: entry.opponent.id,
      reporterTeamId: entry.reporter.id,
      extraTeamId: entry.extra?.id ?? null,
    })),
  }));
  return { pools, plans: bestPlans };
}

// Greedy maximum mixing: each team goes to the round-2 pool holding the
// fewest teammates from its round-1 pool.
function composeRound2Pools(allTeams: FinaleTeam[], poolSize: number, round1Groups: FinaleTeam[][]): FinaleTeam[][] {
  const round1PoolByTeam = new Map<string, number>();
  round1Groups.forEach((teams, idx) => {
    for (const t of teams) round1PoolByTeam.set(t.id, idx);
  });

  const shuffled = shuffle(allTeams);
  const poolBuckets = computePoolBuckets(shuffled.length, poolSize);
  const round2Pools: FinaleTeam[][] = poolBuckets.map(() => []);

  for (const team of shuffled) {
    const r1Idx = round1PoolByTeam.get(team.id);
    let bestPoolIdx = -1;
    let bestScore = Infinity;
    for (let p = 0; p < poolBuckets.length; p++) {
      if (round2Pools[p].length >= poolBuckets[p]) continue;
      const sameR1Count = round2Pools[p].filter((t) => round1PoolByTeam.get(t.id) === r1Idx).length;
      const score = sameR1Count * 100 + round2Pools[p].length;
      if (score < bestScore) {
        bestScore = score;
        bestPoolIdx = p;
      }
    }
    if (bestPoolIdx === -1) throw new Error("Erreur interne : aucune poule disponible pour le tour 2.");
    round2Pools[bestPoolIdx].push(team);
  }

  return round2Pools;
}

// ================== Per-pool optimal solve ==================

// Penalty of playing `problem` in a passage, given its defender and
// opponent (roles fixed by the Latin square). DD is forbidden, not scored.
function passagePenalty(defender: FinaleTeam, opponent: FinaleTeam, problem: number, history: Map<string, TeamHistory>): number {
  let s = 0;
  const def = history.get(defender.id);
  if (def?.opposed.has(problem)) s += WEIGHT_LOW; // DO
  if (def?.reported.has(problem)) s += WEIGHT_LOW; // DR
  const opp = history.get(opponent.id);
  if (opp) {
    if (opp.opposed.has(problem)) s += WEIGHT_HIGH; // OO
    if (opp.defended.has(problem)) s += WEIGHT_HIGH; // OD
    if (opp.reported.has(problem)) s += WEIGHT_HIGH; // OR
  }
  return s;
}

// For every Latin square (role layout) of the pool, "which problem in which
// passage" is a square min-cost assignment; keeps the global minimum.
// Returns null only if no layout admits a DD-feasible assignment.
function solvePoolOptimal(
  teams: FinaleTeam[],
  poolProblems: number[],
  history: Map<string, TeamHistory>,
): { passages: PassageAssignment[]; score: number } | null {
  const n = teams.length;
  let best: { passages: PassageAssignment[]; score: number } | null = null;

  for (const square of n === 4 ? LATIN_SQUARES_4 : LATIN_SQUARES_3) {
    // cost[i][k] = penalty of playing poolProblems[k] in passage i
    const cost = square.map((row) => {
      const defender = teams[row[0]];
      const opponent = teams[row[1]];
      const defended = history.get(defender.id)?.defended;
      return poolProblems.map((problem) =>
        defended?.has(problem) ? FORBIDDEN : passagePenalty(defender, opponent, problem, history),
      );
    });

    const assign = minCostAssignment(cost); // assign[i] = problem index of passage i
    const costs = assign.map((k, i) => cost[i][k]);
    if (costs.some((c) => c >= FORBIDDEN)) continue;
    const total = costs.reduce((a, b) => a + b, 0);

    if (best === null || total < best.score) {
      best = {
        score: total,
        passages: square.map((row, i) => ({
          defender: teams[row[0]],
          opponent: teams[row[1]],
          reporter: teams[row[2]],
          extra: n === 4 ? teams[row[3]] : undefined,
          problem: poolProblems[assign[i]],
        })),
      };
      if (total === 0) return best; // optimal — stop early
    }
  }

  return best;
}

// ================== Constraint report ==================

function buildConstraintReport(
  teams: FinaleTeam[],
  plans: PoolPlan[],
  round1: DrawnPool[],
  history: Map<string, TeamHistory>,
): ConstraintReport {
  const quadById = new Map(teams.map((t) => [t.id, t.quadrigram]));
  const violations: ConstraintViolation[] = [];
  let totalScore = 0;

  // The round-1 passage where `teamId` held `role` on `problem`
  const origin = (teamId: string, problem: number, role: Round1Role) => {
    for (const pool of round1) {
      for (const p of pool.passages) {
        const holder = role === "defended" ? p.defenderTeamId : role === "opposed" ? p.opponentTeamId : p.reporterTeamId;
        if (p.problemNumber === problem && holder === teamId) return { poolLabel: pool.label, passageLabel: p.label };
      }
    }
    return { poolLabel: "?", passageLabel: "?" };
  };

  const push = (code: ConstraintCode, weight: number, teamId: string, problem: number, poolLabel: string, passageLabel: string, r2Role: Round2Role, r1Role: Round1Role) => {
    totalScore += weight;
    violations.push({
      code,
      weight,
      teamId,
      teamQuad: quadById.get(teamId) ?? "?",
      problemNumber: problem,
      round2: { poolLabel, passageLabel, role: r2Role },
      round1: { ...origin(teamId, problem, r1Role), role: r1Role },
    });
  };

  for (const plan of plans) {
    plan.passages.forEach((entry, i) => {
      const passageLabel = `${plan.label}P${i + 1}`;
      const prob = entry.problem;
      const defH = history.get(entry.defender.id);
      if (defH?.opposed.has(prob)) push("DO", WEIGHT_LOW, entry.defender.id, prob, plan.label, passageLabel, "defender", "opposed");
      if (defH?.reported.has(prob)) push("DR", WEIGHT_LOW, entry.defender.id, prob, plan.label, passageLabel, "defender", "reported");
      const oppH = history.get(entry.opponent.id);
      if (oppH?.opposed.has(prob)) push("OO", WEIGHT_HIGH, entry.opponent.id, prob, plan.label, passageLabel, "opponent", "opposed");
      if (oppH?.defended.has(prob)) push("OD", WEIGHT_HIGH, entry.opponent.id, prob, plan.label, passageLabel, "opponent", "defended");
      if (oppH?.reported.has(prob)) push("OR", WEIGHT_HIGH, entry.opponent.id, prob, plan.label, passageLabel, "opponent", "reported");
    });
  }

  return { generatedAt: new Date().toISOString(), totalScore, violations };
}

// ================== Helpers ==================

function splitIntoPools<T>(teams: T[], preferredSize: number): T[][] {
  const result: T[][] = [];
  let idx = 0;
  for (const size of computePoolBuckets(teams.length, preferredSize)) {
    result.push(teams.slice(idx, idx + size));
    idx += size;
  }
  return result;
}

type LatinSquare = readonly (readonly number[])[];

const LATIN_SQUARES_3 = buildLatinSquares(3);
const LATIN_SQUARES_4 = buildLatinSquares(4);

// Every n×n Latin square: row i = the team indices holding each role in
// passage i (defender, opponent, reporter[, observer]).
function buildLatinSquares(n: number): LatinSquare[] {
  const result: LatinSquare[] = [];
  const grid: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1));

  function fillCell(row: number, col: number): void {
    if (col === n) {
      result.push(grid.map((r) => [...r]));
      return;
    }
    if (row === n) {
      fillCell(0, col + 1);
      return;
    }
    for (let value = 0; value < n; value++) {
      let conflict = false;
      for (let r = 0; r < row && !conflict; r++) if (grid[r][col] === value) conflict = true;
      for (let c = 0; c < col && !conflict; c++) if (grid[row][c] === value) conflict = true;
      if (conflict) continue;
      grid[row][col] = value;
      fillCell(row + 1, col);
      grid[row][col] = -1;
    }
  }

  fillCell(0, 0);
  return result;
}
