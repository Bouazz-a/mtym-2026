import { describe, expect, it } from "vitest";
import { choiceCost, generateQualifsDay, seatByRanking, splitForQualifs, QUALIFS_PROBLEMS, type DrawnPool } from "./poolDraw";

const teams = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `team-${i}` }));

describe("generateQualifsDay", () => {
  const drawable = [3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 17, 30, 45];

  it.each(drawable)("draws %i teams into valid pools", (n) => {
    const { pools, leftover } = generateQualifsDay({ teams: teams(n), labelPrefix: "CAS-B" });

    const placed = new Set<string>();
    for (const pool of pools) {
      const ps = pool.passages;
      const members = new Set(ps.flatMap((p) => [p.defenderTeamId, p.opponentTeamId, p.reporterTeamId, p.extraTeamId ?? []].flat()));

      expect([3, 4]).toContain(ps.length); // pools of 3 or 4…
      expect(members.size).toBe(ps.length); // …with one passage per team
      expect(new Set(ps.map((p) => p.defenderTeamId)).size).toBe(ps.length); // each defends once
      expect(new Set(ps.map((p) => p.problemNumber)).size).toBe(ps.length); // no repeated problem
      for (const p of ps) {
        expect(QUALIFS_PROBLEMS).toContain(p.problemNumber);
        const roles = [p.defenderTeamId, p.opponentTeamId, p.reporterTeamId, p.extraTeamId].filter(Boolean);
        expect(new Set(roles).size).toBe(roles.length); // one role per team per passage
        expect(Boolean(p.extraTeamId)).toBe(ps.length === 4); // observer only in pools of 4
      }
      for (const t of members) {
        expect(placed.has(t)).toBe(false); // never in two pools
        placed.add(t);
      }
      expect(pool.label).toMatch(/^CAS-B\d+$/);
      // passage n of every pool plays in slot n
      ps.forEach((p, i) => {
        expect(p.label).toBe(`${pool.label}P${i + 1}`);
        expect(p.slot).toBe(i + 1);
      });
    }
    expect(placed.size).toBe(n); // every team is placed
    expect(leftover).toHaveLength(0);
  });

  it("prefers pools of 4", () => {
    const { pools } = generateQualifsDay({ teams: teams(8), labelPrefix: "" });
    expect(pools).toHaveLength(2);
  });

  it("continues an existing series of labels", () => {
    const { pools } = generateQualifsDay({ teams: teams(8), labelPrefix: "CAS-A", labelStart: 3 });
    expect(pools.map((p) => p.label)).toEqual(["CAS-A3", "CAS-A4"]);
  });

  it("places what it can out of 5 teams", () => {
    const { pools, leftover } = generateQualifsDay({ teams: teams(5), labelPrefix: "" });
    expect(pools).toHaveLength(1);
    expect(leftover).toHaveLength(1);
  });

  // Per slot, how many passages play each problem
  const perSlot = (passages: { slot: number; problemNumber: number }[]) => {
    const counts = new Map<number, number[]>();
    for (const p of passages) {
      const row = counts.get(p.slot) ?? QUALIFS_PROBLEMS.map(() => 0);
      row[QUALIFS_PROBLEMS.indexOf(p.problemNumber)]++;
      counts.set(p.slot, row);
    }
    return counts;
  };

  it.each([7, 13, 16, 30, 32, 44, 45, 61])("spreads the problems of each slot across %i teams", (n) => {
    for (let run = 0; run < 20; run++) {
      const { pools } = generateQualifsDay({ teams: teams(n), labelPrefix: "" });
      for (const [slot, row] of perSlot(pools.flatMap((p) => p.passages))) {
        // as even as the slot's passages allow: at most one apart
        expect(Math.max(...row) - Math.min(...row), `slot ${slot}: ${row}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("balances the pools it adds against the day's existing passages", () => {
    // Existing: two pools that both play problem 1 in slot 1, problem 2 in slot 2…
    const taken = [1, 2, 3, 4].flatMap((slot) => [{ slot, problemNumber: slot }, { slot, problemNumber: slot }]);
    const { pools } = generateQualifsDay({ teams: teams(8), labelPrefix: "", taken });
    for (const p of pools.flatMap((x) => x.passages)) {
      expect(p.problemNumber).not.toBe(p.slot); // problem s is already twice in slot s
    }
  });

  it.each([0, 1, 2])("draws nothing from %i teams", (n) => {
    const { pools, leftover } = generateQualifsDay({ teams: teams(n), labelPrefix: "" });
    expect(pools).toHaveLength(0);
    expect(leftover).toHaveLength(n);
  });
});

describe("drawing from the teams' rankings", () => {
  const ranked = (rankings: number[][]) => rankings.map((problemRanking, i) => ({ id: `team-${i}`, problemRanking }));
  const favoring = (p: number) => [p, ...QUALIFS_PROBLEMS.filter((q) => q !== p)];
  // The problem each team defends
  const defended = (pools: DrawnPool[]) =>
    new Map(pools.flatMap((p) => p.passages).map((x) => [x.defenderTeamId, x.problemNumber]));

  it("gives every team its first choice when the first choices fit", () => {
    // Two teams favoring each problem: two pools of 4 seat them all
    const ts = ranked([1, 1, 2, 2, 3, 3, 4, 4].map(favoring));
    for (let run = 0; run < 20; run++) {
      const got = defended(generateQualifsDay({ teams: ts, labelPrefix: "" }).pools);
      for (const t of ts) expect(got.get(t.id)).toBe(t.problemRanking[0]);
    }
  });

  it("still defends each problem once per pool when every team wants the same one", () => {
    const { pools } = generateQualifsDay({ teams: ranked(Array.from({ length: 12 }, () => favoring(1))), labelPrefix: "" });
    for (const pool of pools) expect(pool.passages.map((p) => p.problemNumber).sort()).toEqual(QUALIFS_PROBLEMS);
  });

  it.each([7, 10, 11, 17, 29, 45])("defends the 4 problems equally often with %i teams", (n) => {
    for (let run = 0; run < 30; run++) {
      const passages = generateQualifsDay({ teams: ranked(Array.from({ length: n }, () => favoring(1))), labelPrefix: "" })
        .pools.flatMap((p) => p.passages);
      const counts = QUALIFS_PROBLEMS.map((p) => passages.filter((x) => x.problemNumber === p).length);
      expect(Math.max(...counts) - Math.min(...counts), `${counts}`).toBeLessThanOrEqual(1);
    }
  });

  // Two seats, problems 1 and 2: which team takes which
  const seat = (a: number[], b: number[]) => {
    const [[first, second]] = seatByRanking([[1, 2]], ranked([a, b]));
    return { team0: first.id === "team-0" ? 1 : 2, team1: second.id === "team-1" ? 2 : 1 };
  };

  it("prefers two 2nd choices to a 1st and a 3rd", () => {
    // team 0 ranks 1 then 2; team 1 ranks 2 third, 1 second
    expect(seat([1, 2, 3, 4], [3, 1, 2, 4])).toEqual({ team0: 2, team1: 1 });
  });

  it("prefers a 1st and a 4th choice to two 3rd choices", () => {
    // team 0: 1 first, 2 third; team 1: 1 third, 2 fourth
    expect(seat([1, 3, 2, 4], [3, 4, 1, 2])).toEqual({ team0: 1, team1: 2 });
  });

  it("costs nothing without a ranking, and ranks left-out problems last", () => {
    expect(QUALIFS_PROBLEMS.map((p) => choiceCost([], p))).toEqual([0, 0, 0, 0]);
    expect(QUALIFS_PROBLEMS.map((p) => choiceCost([4, 2, 1, 3], p))).toEqual([3, 1, 5, 0]);
    expect(QUALIFS_PROBLEMS.map((p) => choiceCost([2], p))).toEqual([1, 0, 1, 1]);
  });
});

describe("splitForQualifs", () => {
  const sizes = (groups: unknown[][]) => groups.map((g) => g.length);

  it.each([
    [3, [3]],
    [4, [4]],
    [6, [3, 3]],
    [7, [4, 3]],
    [8, [4, 4]],
    [11, [4, 4, 3]],
    [12, [4, 4, 4]],
  ])("splits %i teams without leaving anyone out", (n, expected) => {
    const { groups, leftover } = splitForQualifs(teams(n));
    expect(sizes(groups)).toEqual(expected);
    expect(leftover).toHaveLength(0);
  });

  it("out of 5 teams, plays 4 and leaves 1 aside", () => {
    const { groups, leftover } = splitForQualifs(teams(5));
    expect(sizes(groups)).toEqual([4]);
    expect(leftover).toHaveLength(1);
  });

  it.each([0, 1, 2])("leaves %i team(s) aside rather than making a pool of two", (n) => {
    const { groups, leftover } = splitForQualifs(teams(n));
    expect(groups).toHaveLength(0);
    expect(leftover).toHaveLength(n);
  });

  it("never loses or duplicates a team", () => {
    for (const n of [3, 5, 9, 14, 23]) {
      const { groups, leftover } = splitForQualifs(teams(n));
      const seen = [...groups.flat(), ...leftover].map((t) => t.id);
      expect(new Set(seen).size).toBe(n);
    }
  });
});
