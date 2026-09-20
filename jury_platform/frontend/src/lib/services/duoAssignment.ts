// Automatic assignment of jury duos to a day's passages. The duos
// themselves are always formed by hand; this only decides who judges what.
//
// The day is a grid: one column per pool, one row per slot, the pools
// playing their passage n at the same time. Rules, in order of importance:
//
//   1. a duo can't be in two rooms at once — never twice in the same slot;
//   2. a duo should judge at most one passage per pool (the "Doublon"
//      warning of the timetable), so teams meet different jurors;
//   3. the passages are spread evenly between duos;
//   4. with too few duos, passages are left without one rather than
//      breaking rule 1.
//
// Rules 2 and 3 are costs, not walls: with more pools than duos, someone
// has to judge a pool twice, and the result is still better than nothing
// (the timetable keeps flagging what's worth a look).

export interface AssignPassage {
  id: string;
  slot: number;
  duoId: string | null;
  /** Already graded: the server refuses to move it, so it stays put */
  locked: boolean;
}

export interface AssignPool {
  id: string;
  label: string;
  passages: AssignPassage[];
}

export interface AssignDuo {
  id: string;
  number: number;
}

export type AssignMode = "fill" | "replace";

export interface Assignment {
  passageId: string;
  duoId: string | null;
}

export interface AssignmentPlan {
  /** Only what changes, ready for the API */
  changes: Assignment[];
  assigned: number; // passages that end up with a duo
  withoutDuo: number; // passages left without one (not enough duos)
  samePool: number; // duos judging a pool twice (rule 2 given up)
  perDuo: { duoId: string; count: number }[];
}

const NOT_ASSIGNED = 1e9; // leaving a passage without a duo: last resort
const SAME_POOL = 1e6; // a duo judging the same pool twice
const LOAD = 1e3; // one more passage for that duo

export function planDuoAssignment(
  pools: AssignPool[],
  duos: AssignDuo[],
  mode: AssignMode,
): AssignmentPlan {
  // Deterministic order: same day, same duos, same plan.
  const byLabel = [...pools].sort((a, b) => a.label.localeCompare(b.label));
  const sortedDuos = [...duos].sort((a, b) => a.number - b.number);
  const slots = [...new Set(byLabel.flatMap((p) => p.passages.map((x) => x.slot)))].sort((a, b) => a - b);

  // What each passage ends up with, starting from what is kept as is
  const chosen = new Map<string, string | null>();
  const poolOf = new Map<string, string>();
  const keep = (p: AssignPassage) => p.locked || (mode === "fill" && p.duoId !== null);
  for (const pool of byLabel) {
    for (const passage of pool.passages) {
      poolOf.set(passage.id, pool.id);
      chosen.set(passage.id, keep(passage) ? passage.duoId : null);
    }
  }

  const load = new Map(sortedDuos.map((d) => [d.id, 0]));
  const poolsOfDuo = new Map(sortedDuos.map((d) => [d.id, new Set<string>()]));
  for (const [passageId, duoId] of chosen) {
    if (!duoId || !load.has(duoId)) continue;
    load.set(duoId, load.get(duoId)! + 1);
    poolsOfDuo.get(duoId)!.add(poolOf.get(passageId)!);
  }

  for (const slot of slots) {
    const free: { passage: AssignPassage; poolId: string }[] = [];
    const busy = new Set<string>(); // duos already judging in this slot
    for (const pool of byLabel) {
      for (const passage of pool.passages) {
        if (passage.slot !== slot) continue;
        const kept = chosen.get(passage.id);
        if (keep(passage)) {
          if (kept) busy.add(kept);
        } else {
          free.push({ passage, poolId: pool.id });
        }
      }
    }
    if (free.length === 0) continue;

    const candidates = sortedDuos.filter((d) => !busy.has(d.id));
    // One column per candidate duo, plus one "no duo" column per passage so
    // a matching always exists.
    const columns = free.length + candidates.length;
    const cost = free.map(({ poolId }) =>
      Array.from({ length: columns }, (_, col) => {
        const duo = candidates[col];
        if (!duo) return NOT_ASSIGNED;
        return (
          (poolsOfDuo.get(duo.id)!.has(poolId) ? SAME_POOL : 0) +
          LOAD * load.get(duo.id)! +
          duo.number // tiebreak: the lowest-numbered duo goes first
        );
      }),
    );

    const matched = minCostAssignment(cost);
    matched.forEach((col, row) => {
      const duo = candidates[col];
      const { passage, poolId } = free[row];
      if (!duo) return; // left without a duo
      chosen.set(passage.id, duo.id);
      load.set(duo.id, load.get(duo.id)! + 1);
      poolsOfDuo.get(duo.id)!.add(poolId);
    });
  }

  // Report and diff
  let assigned = 0;
  let withoutDuo = 0;
  const changes: Assignment[] = [];
  const seenPools = new Map<string, Set<string>>();
  let samePool = 0;
  for (const pool of byLabel) {
    for (const passage of pool.passages) {
      const duoId = chosen.get(passage.id) ?? null;
      if (duoId) {
        assigned++;
        const pools = seenPools.get(duoId) ?? new Set<string>();
        if (pools.has(pool.id)) samePool++;
        pools.add(pool.id);
        seenPools.set(duoId, pools);
      } else {
        withoutDuo++;
      }
      if (duoId !== passage.duoId) changes.push({ passageId: passage.id, duoId });
    }
  }

  return {
    changes,
    assigned,
    withoutDuo,
    samePool,
    perDuo: sortedDuos.map((d) => ({ duoId: d.id, count: load.get(d.id) ?? 0 })),
  };
}

// ─── Min-cost assignment (Hungarian algorithm, e-maxx formulation) ──────
// Rows are passages, columns duos; returns each row's column. Requires at
// least as many columns as rows, which the "no duo" columns guarantee.
// O(rows² × columns) — a handful of passages per slot, so instant.
function minCostAssignment(cost: number[][]): number[] {
  const rows = cost.length;
  const cols = cost[0]?.length ?? 0;
  const u = new Array(rows + 1).fill(0); // row potentials
  const v = new Array(cols + 1).fill(0); // column potentials
  const match = new Array(cols + 1).fill(0); // column -> row (1-based, 0 = free)
  const way = new Array(cols + 1).fill(0); // column -> previous column

  for (let row = 1; row <= rows; row++) {
    match[0] = row;
    let col0 = 0;
    const minv = new Array(cols + 1).fill(Infinity);
    const used = new Array(cols + 1).fill(false);
    do {
      used[col0] = true;
      const row0 = match[col0];
      let delta = Infinity;
      let col1 = 0;
      for (let col = 1; col <= cols; col++) {
        if (used[col]) continue;
        const current = cost[row0 - 1][col - 1] - u[row0] - v[col];
        if (current < minv[col]) { minv[col] = current; way[col] = col0; }
        if (minv[col] < delta) { delta = minv[col]; col1 = col; }
      }
      for (let col = 0; col <= cols; col++) {
        if (used[col]) { u[match[col]] += delta; v[col] -= delta; }
        else minv[col] -= delta;
      }
      col0 = col1;
    } while (match[col0] !== 0);
    do {
      const col1 = way[col0];
      match[col0] = match[col1];
      col0 = col1;
    } while (col0);
  }

  const result = new Array<number>(rows).fill(-1);
  for (let col = 1; col <= cols; col++) {
    if (match[col] > 0) result[match[col] - 1] = col - 1;
  }
  return result;
}
