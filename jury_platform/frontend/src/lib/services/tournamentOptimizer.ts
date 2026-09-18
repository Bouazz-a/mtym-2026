import type { Passage, Pool, Team } from "@/types";
import { buildPassageLabel, buildPoolLabel } from "@/utils/labels";
import { ConflictError } from "./errors";
import type {
  ConstraintCode,
  Round1Role,
  Round2Role,
  ConstraintViolation,
  ConstraintReport,
} from "./constraintReport";
export type {
  ConstraintCode,
  Round1Role,
  Round2Role,
  ConstraintViolation,
  ConstraintReport,
} from "./constraintReport";

// tournamentOptimizer.ts — pool draws. Pure computation: nothing here talks
// to the API; the caller saves the result (see saveDraw in
// centerDayRepository.ts), and the backend re-checks it before replacing
// the day's pools.
//
// · Qualifications (used): generateQualifsDay — one round per center day,
//   pools of 4 (3 when the team count requires it), every team defends
//   once, problems drawn at random without repeats inside a pool.
//
// · Finale (kept for later, not wired to any page): generateBothRoundsOptimal
//   solves the Round 2 problem-assignment as a min-cost assignment
//   (Hungarian algorithm) per Latin square, and is *best-effort*: it never
//   throws when a perfect (score 0) solution is impossible. Instead it
//   keeps the globally minimum-penalty plan it found and publishes a
//   ConstraintReport that lists exactly which team violates which soft
//   constraint, with the round-1 origin and round-2 occurrence of each
//   conflict.
//
//   Code  Round 1 role      Round 2 role        Weight
//   ----  --------          --------            ------
//   DD    defended P        defends P           ABSOLUTE (forbidden)
//   OO    opposed  P        opposes P           15
//   OD    defends  P        opposes P           15
//   OR    reported P        opposes P           15
//   DO    opposed P         defends P            5
//   DR    reported P        defends P            5

const MAX_ATTEMPTS = 10000;
const WEIGHT_HIGH = 15; // OO, OD, OR
const WEIGHT_LOW = 5; // DO, DR
// Forbidden (DD) cells get a cost far above any achievable real penalty so
// the Hungarian solver only ever picks one if no feasible matching exists
// (which we then detect and reject).
const FORBIDDEN = 1e7;

// ================== Public API ==================

export interface TeamPoolAssignment {
  teamId: string;
  poolId: string;
}

export interface GenerateRoundsArgs {
  teams: Team[];
  poolSize?: number; // default 4; pools of 3 emerge from team count remainder
  problemPool: number[];
}

export interface GeneratedRound {
  pools: Pool[];
  passages: Passage[];
  teamPoolAssignments: TeamPoolAssignment[];
}

export interface GenerateRoundsResult {
  round1: GeneratedRound;
  round2: GeneratedRound;
  report: ConstraintReport;
}

export const QUALIFS_PROBLEMS = [1, 2, 3, 4];

// Qualifications: draw the pools of one center day. Pools of 4, or 3 when
// the team count requires it — 1, 2 and 5 teams can't be split that way.
export function generateQualifsDay(args: {
  teams: Team[];
  labelPrefix: string; // e.g. "CAS-J1-" -> pools CAS-J1-A1, CAS-J1-A2…
  problemPool?: number[];
}): GeneratedRound {
  const n = args.teams.length;
  if (n < 3 || n === 5) {
    throw new ConflictError(
      `Impossible de former des poules de 3 ou 4 avec ${n} équipe${n > 1 ? "s" : ""} — déplacez des équipes vers un autre jour.`,
    );
  }
  const composition = splitIntoPools(shuffle([...args.teams]), 4);
  return buildRound1(composition, args.problemPool ?? QUALIFS_PROBLEMS, args.labelPrefix);
}

// Finale: generate both rounds. Round 2 uses the Hungarian solver and never
// throws on soft-constraint infeasibility — the best plan found is returned
// along with a ConstraintReport describing any residual violations.
export function generateBothRoundsOptimal(
  args: GenerateRoundsArgs,
): GenerateRoundsResult {
  const poolSize = args.poolSize ?? 4;
  if (poolSize < 3 || poolSize > 4) {
    throw new ConflictError("La taille de poule doit être 3 ou 4.");
  }
  if (args.teams.length < 3) {
    throw new ConflictError(
      `Pas assez d'équipes (${args.teams.length}) pour former une poule.`,
    );
  }
  if (args.problemPool.length < poolSize) {
    throw new ConflictError(
      `Pas assez de problèmes (${args.problemPool.length}) pour ${poolSize} équipes par poule.`,
    );
  }

  // --- Round 1: trivial round-robin ---
  const round1Composition = splitIntoPools(shuffle([...args.teams]), poolSize);
  const round1 = buildRound1(round1Composition, args.problemPool);

  // --- Round 2: Hungarian per Latin square, best-effort ---
  const history = buildHistory(round1.passages);
  const round2 = generateRound2BestEffort(
    poolSize,
    args.problemPool,
    round1Composition,
    history,
  );

  const report = buildConstraintReport(args.teams, round2.plans, round1, history);

  return { round1, round2, report };
}

// ================== Round 1 ==================

interface PoolComposition {
  teamsInPool: Team[];
}

function buildRound1(
  composition: PoolComposition[],
  problemPool: number[],
  labelPrefix = "",
): GeneratedRound {
  const pools: Pool[] = [];
  const passages: Passage[] = [];
  const teamPoolAssignments: TeamPoolAssignment[] = [];

  composition.forEach((pc, idx) => {
    const pool: Pool = {
      id: crypto.randomUUID(),
      label: labelPrefix + buildPoolLabel(1, idx),
      round: 1,
    };
    pools.push(pool);

    for (const team of pc.teamsInPool) {
      teamPoolAssignments.push({ teamId: team.id, poolId: pool.id });
    }

    const N = pc.teamsInPool.length;
    const poolProblems = randomSample(problemPool, N);

    for (let i = 0; i < N; i++) {
      passages.push({
        id: crypto.randomUUID(),
        label: buildPassageLabel(pool.label, i),
        problemNumber: poolProblems[i],
        poolId: pool.id,
        defenderTeamId: pc.teamsInPool[i].id,
        opponentTeamId: pc.teamsInPool[(i + 1) % N].id,
        reporterTeamId: pc.teamsInPool[(i + 2) % N].id,
        extraTeamId: N === 4 ? pc.teamsInPool[(i + 3) % N].id : undefined,
      });
    }
  });

  return { pools, passages, teamPoolAssignments };
}

// ================== Round 2 ==================

interface TeamHistory {
  defended: Set<number>;
  opposed: Set<number>;
  reported: Set<number>;
}

function buildHistory(round1Passages: Passage[]): Map<string, TeamHistory> {
  const map = new Map<string, TeamHistory>();
  const ensure = (id: string): TeamHistory => {
    let h = map.get(id);
    if (!h) {
      h = { defended: new Set(), opposed: new Set(), reported: new Set() };
      map.set(id, h);
    }
    return h;
  };
  for (const p of round1Passages) {
    ensure(p.defenderTeamId).defended.add(p.problemNumber);
    ensure(p.opponentTeamId).opposed.add(p.problemNumber);
    ensure(p.reporterTeamId).reported.add(p.problemNumber);
  }
  return map;
}

interface PassageAssignment {
  defender: Team;
  opponent: Team;
  reporter: Team;
  extra: Team | undefined;
  problem: number;
}

interface PoolPlan {
  pool: Pool;
  teamsInPool: Team[];
  passages: PassageAssignment[];
  score: number;
}

// Try many random round-2 compositions; for each, solve every pool with the
// Hungarian assignment and keep the composition with the lowest *total*
// penalty. Never throws on residual penalty — returns the best plan found.
function generateRound2BestEffort(
  poolSize: number,
  problemPool: number[],
  round1Composition: PoolComposition[],
  history: Map<string, TeamHistory>,
): GeneratedRound & { plans: PoolPlan[] } {
  const allTeams = round1Composition.flatMap((pc) => pc.teamsInPool);
  let bestPlans: PoolPlan[] | null = null;
  let bestTotal = Infinity;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const composition = composeRound2Pools(
      allTeams,
      poolSize,
      round1Composition,
    );

    const plans: PoolPlan[] = [];
    let total = 0;
    let feasible = true;

    for (let poolIdx = 0; poolIdx < composition.length; poolIdx++) {
      const pc = composition[poolIdx];
      const poolProblems = randomSample(problemPool, pc.teamsInPool.length);
      const solved = solvePoolOptimal(pc.teamsInPool, poolProblems, history);
      if (solved === null) {
        feasible = false;
        break;
      }
      total += solved.score;
      plans.push({
        pool: { id: crypto.randomUUID(), label: buildPoolLabel(2, poolIdx), round: 2 },
        teamsInPool: pc.teamsInPool,
        passages: solved.passages,
        score: solved.score,
      });
    }

    if (!feasible) continue;

    if (total < bestTotal) {
      bestTotal = total;
      bestPlans = plans;
      if (total === 0) break; // can't do better than a perfect plan
    }
  }

  if (bestPlans === null) {
    // Only reachable if every composition was DD-infeasible, which cannot
    // happen when |problemPool| >= poolSize (Hall's theorem) — but guard
    // anyway rather than corrupt state.
    throw new ConflictError(
      "Impossible de composer le tour 2 (contrainte absolue DD insatisfiable).",
    );
  }

  const pools: Pool[] = [];
  const passages: Passage[] = [];
  const teamPoolAssignments: TeamPoolAssignment[] = [];
  for (const plan of bestPlans) {
    pools.push(plan.pool);
    for (const team of plan.teamsInPool) {
      teamPoolAssignments.push({ teamId: team.id, poolId: plan.pool.id });
    }
    plan.passages.forEach((entry, i) => {
      passages.push({
        id: crypto.randomUUID(),
        label: buildPassageLabel(plan.pool.label, i),
        problemNumber: entry.problem,
        poolId: plan.pool.id,
        defenderTeamId: entry.defender.id,
        opponentTeamId: entry.opponent.id,
        reporterTeamId: entry.reporter.id,
        extraTeamId: entry.extra?.id,
      });
    });
  }

  return { pools, passages, teamPoolAssignments, plans: bestPlans };
}

// Compose round 2 pools by greedy maximum-mixing: each team is assigned to
// the round 2 pool with the fewest teammates from its round 1 pool.
function composeRound2Pools(
  allTeams: Team[],
  poolSize: number,
  round1Composition: PoolComposition[],
): PoolComposition[] {
  const round1PoolByTeam = new Map<string, number>();
  round1Composition.forEach((pc, idx) => {
    for (const t of pc.teamsInPool) round1PoolByTeam.set(t.id, idx);
  });

  const shuffled = shuffle([...allTeams]);
  const poolBuckets = computePoolBuckets(shuffled.length, poolSize);
  const round2Pools: Team[][] = poolBuckets.map(() => []);

  for (const team of shuffled) {
    const r1Idx = round1PoolByTeam.get(team.id);
    let bestPoolIdx = -1;
    let bestScore = Infinity;

    for (let p = 0; p < poolBuckets.length; p++) {
      if (round2Pools[p].length >= poolBuckets[p]) continue;
      const sameR1Count = round2Pools[p].filter(
        (t) => round1PoolByTeam.get(t.id) === r1Idx,
      ).length;
      const score = sameR1Count * 100 + round2Pools[p].length;
      if (score < bestScore) {
        bestScore = score;
        bestPoolIdx = p;
      }
    }

    if (bestPoolIdx === -1) {
      throw new ConflictError(
        "Erreur interne : aucune poule disponible pour le tour 2.",
      );
    }
    round2Pools[bestPoolIdx].push(team);
  }

  return round2Pools.map((teamsInPool) => ({ teamsInPool }));
}

// ================== Per-pool Hungarian solve ==================

// Penalty contributed by a single passage if `problem` is played there,
// given the defender / opponent / reporter teams (roles fixed by the Latin
// square). DD is handled separately (forbidden), not scored here.
function passagePenalty(
  defender: Team,
  opponent: Team,
  problem: number,
  history: Map<string, TeamHistory>,
): number {
  let s = 0;
  const def = history.get(defender.id);
  if (def?.opposed.has(problem)) s += WEIGHT_LOW; // DO
  if (def?.reported.has(problem)) s += WEIGHT_LOW; // DR
  const opp = history.get(opponent.id);
  if (opp) {
    if (opp.opposed.has(problem)) s += WEIGHT_HIGH; // OO
    if (opp.defended.has(problem)) s += WEIGHT_HIGH; // DO
    if (opp.reported.has(problem)) s += WEIGHT_HIGH; // OR
  }
  return s;
}

// For a pool, enumerate every Latin square (role assignment). For each, the
// "which problem in which passage" sub-problem is a square min-cost
// assignment solved exactly by the Hungarian algorithm. Track the global
// minimum across all Latin squares. Returns null only if no Latin square
// admits a DD-feasible assignment.
function solvePoolOptimal(
  teams: Team[],
  poolProblems: number[],
  history: Map<string, TeamHistory>,
): { passages: PassageAssignment[]; score: number } | null {
  const N = teams.length;
  const latinSquares = N === 4 ? LATIN_SQUARES_4 : LATIN_SQUARES_3;
  let best: { passages: PassageAssignment[]; score: number } | null = null;

  for (const square of latinSquares) {
    // cost[i][k] = penalty of playing poolProblems[k] at passage i.
    const cost: number[][] = new Array(N);
    for (let i = 0; i < N; i++) {
      const defender = teams[square[i][0]];
      const opponent = teams[square[i][1]];
      const row = new Array<number>(N);
      const defHist = history.get(defender.id);
      for (let k = 0; k < N; k++) {
        const problem = poolProblems[k];
        if (defHist?.defended.has(problem)) {
          row[k] = FORBIDDEN; // DD — absolute
        } else {
          row[k] = passagePenalty(
            defender,
            opponent,
            problem,
            history,
          );
        }
      }
      cost[i] = row;
    }

    const assign = hungarian(cost); // assign[i] = problem slot for passage i
    let total = 0;
    let feasible = true;
    for (let i = 0; i < N; i++) {
      const c = cost[i][assign[i]];
      if (c >= FORBIDDEN) {
        feasible = false;
        break;
      }
      total += c;
    }
    if (!feasible) continue;

    if (best === null || total < best.score) {
      const passages: PassageAssignment[] = new Array(N);
      for (let i = 0; i < N; i++) {
        passages[i] = {
          defender: teams[square[i][0]],
          opponent: teams[square[i][1]],
          reporter: teams[square[i][2]],
          extra: N === 4 ? teams[square[i][3]] : undefined,
          problem: poolProblems[assign[i]],
        };
      }
      best = { passages, score: total };
      if (total === 0) return best; // optimal — stop early
    }
  }

  return best;
}

// Hungarian algorithm (Kuhn–Munkres, O(n^3) shortest-augmenting-path
// variant, 1-indexed internally). Returns ans where ans[row] = column.
// Handles FORBIDDEN cells via a large finite cost.
function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[col] = row matched to col
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const ans = new Array<number>(n);
  for (let j = 1; j <= n; j++) ans[p[j] - 1] = j - 1;
  return ans;
}

// ================== Constraint report ==================

function buildConstraintReport(
  teams: Team[],
  plans: PoolPlan[],
  round1: GeneratedRound,
  history: Map<string, TeamHistory>,
): ConstraintReport {
  const quadById = new Map<string, string>();
  for (const t of teams) quadById.set(t.id, t.quadrigram);

  const r1PoolLabelById = new Map<string, string>();
  for (const po of round1.pools) r1PoolLabelById.set(po.id, po.label);

  const violations: ConstraintViolation[] = [];
  let totalScore = 0;

  // Locate the round-1 passage where `teamId` held `r1Role` on `problem`.
  const findRound1Origin = (
    teamId: string,
    problem: number,
    r1Role: Round1Role,
  ): { poolLabel: string; passageLabel: string } => {
    for (const p of round1.passages) {
      if (p.problemNumber !== problem) continue;
      const holder =
        r1Role === "defended"
          ? p.defenderTeamId
          : r1Role === "opposed"
            ? p.opponentTeamId
            : p.reporterTeamId;
      if (holder === teamId) {
        return {
          poolLabel: r1PoolLabelById.get(p.poolId) ?? "?",
          passageLabel: p.label,
        };
      }
    }
    return { poolLabel: "?", passageLabel: "?" };
  };

  const push = (
    code: ConstraintCode,
    weight: number,
    teamId: string,
    problem: number,
    poolLabel: string,
    passageLabel: string,
    r2Role: Round2Role,
    r1Role: Round1Role,
  ) => {
    totalScore += weight;
    const origin = findRound1Origin(teamId, problem, r1Role);
    violations.push({
      code,
      weight,
      teamId,
      teamQuad: quadById.get(teamId) ?? "?",
      problemNumber: problem,
      round2: { poolLabel, passageLabel, role: r2Role },
      round1: {
        poolLabel: origin.poolLabel,
        passageLabel: origin.passageLabel,
        role: r1Role,
      },
    });
  };

  for (const plan of plans) {
    plan.passages.forEach((entry, i) => {
      const passageLabel = buildPassageLabel(plan.pool.label, i);
      const prob = entry.problem;

      const defH = history.get(entry.defender.id);
      if (defH?.opposed.has(prob)) {
        push(
          "DO",
          WEIGHT_LOW,
          entry.defender.id,
          prob,
          plan.pool.label,
          passageLabel,
          "defender",
          "opposed",
        );
      }
      if (defH?.reported.has(prob)) {
        push(
          "DR",
          WEIGHT_LOW,
          entry.defender.id,
          prob,
          plan.pool.label,
          passageLabel,
          "defender",
          "reported",
        );
      }
      const oppH = history.get(entry.opponent.id);
      if (oppH?.opposed.has(prob)) {
        push(
          "OO",
          WEIGHT_HIGH,
          entry.opponent.id,
          prob,
          plan.pool.label,
          passageLabel,
          "opponent",
          "opposed",
        );
      }
      if (oppH?.defended.has(prob)) {
        push(
          "OD",
          WEIGHT_HIGH,
          entry.opponent.id,
          prob,
          plan.pool.label,
          passageLabel,
          "opponent",
          "defended",
        );
      }
      if (oppH?.reported.has(prob)) {
        push(
          "OR",
          WEIGHT_HIGH,
          entry.opponent.id,
          prob,
          plan.pool.label,
          passageLabel,
          "opponent",
          "reported",
        );
      }
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    totalScore,
    violations,
  };
}

// ================== Pure helpers (self-contained copies) ==================

type LatinRow = readonly number[];
type LatinSquare = readonly LatinRow[];

const LATIN_SQUARES_3: ReadonlyArray<LatinSquare> = buildLatinSquares(3);
const LATIN_SQUARES_4: ReadonlyArray<LatinSquare> = buildLatinSquares(4);

function buildLatinSquares(N: number): LatinSquare[] {
  const indices = Array.from({ length: N }, (_, i) => i);
  const result: LatinSquare[] = [];
  const grid: number[][] = Array.from({ length: N }, () =>
    new Array(N).fill(-1),
  );

  function fillCell(row: number, col: number): void {
    if (col === N) {
      result.push(grid.map((r) => [...r]));
      return;
    }
    if (row === N) {
      fillCell(0, col + 1);
      return;
    }
    for (const value of indices) {
      let colConflict = false;
      for (let r = 0; r < row; r++) {
        if (grid[r][col] === value) {
          colConflict = true;
          break;
        }
      }
      if (colConflict) continue;
      let rowConflict = false;
      for (let c = 0; c < col; c++) {
        if (grid[row][c] === value) {
          rowConflict = true;
          break;
        }
      }
      if (rowConflict) continue;
      grid[row][col] = value;
      fillCell(row + 1, col);
      grid[row][col] = -1;
    }
  }

  fillCell(0, 0);
  return result;
}

function computePoolBuckets(
  totalTeams: number,
  preferredSize: number,
): number[] {
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
    if (numFours >= 2) {
      numFours -= 2;
      for (let i = 0; i < numFours; i++) buckets.push(4);
      buckets.push(3);
      buckets.push(3);
      buckets.push(3);
    } else {
      throw new ConflictError(
        `Impossible de former des poules valides avec ${totalTeams} équipes (minimum 7 requis si remainder = 1).`,
      );
    }
  }

  return buckets;
}

function splitIntoPools(
  teams: Team[],
  preferredSize: number,
): PoolComposition[] {
  const buckets = computePoolBuckets(teams.length, preferredSize);
  const result: PoolComposition[] = [];
  let idx = 0;
  for (const size of buckets) {
    result.push({ teamsInPool: teams.slice(idx, idx + size) });
    idx += size;
  }
  return result;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomSample<T>(arr: T[], n: number): T[] {
  if (n > arr.length)
    throw new ConflictError("Pas assez d'éléments à échantillonner.");
  return shuffle(arr).slice(0, n);
}
