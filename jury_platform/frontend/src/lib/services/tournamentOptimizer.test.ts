import { generateQualifsDay, splitForQualifs, QUALIFS_PROBLEMS } from "./tournamentOptimizer";
import { ConflictError } from "./errors";
import type { Team } from "@/types";

function teams(n: number): Team[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `team-${i}`,
    sourceId: i,
    name: `Team ${i}`,
    quadrigram: `T${String(i).padStart(3, "0")}`,
    center: "casablanca",
    members: [],
    centerDayId: "day",
    reports: [],
  }));
}

describe("generateQualifsDay", () => {
  const drawable = [3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 17, 30, 45];

  it.each(drawable)("draws %i teams into valid pools", (n) => {
    const input = teams(n);
    const { pools, passages } = generateQualifsDay({ teams: input, labelPrefix: "CAS-B" });

    const placed = new Map<string, string>(); // teamId -> poolId
    for (const pool of pools) {
      const ps = passages.filter((p) => p.poolId === pool.id);
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
        placed.set(t, pool.id);
      }
      expect(pool.label).toMatch(/^CAS-B\d+$/);
      // passage n of every pool plays in slot n
      ps.forEach((p, i) => {
        expect(p.label).toBe(`${pool.label}P${i + 1}`);
        expect(p.slot).toBe(i + 1);
      });
    }
    expect(placed.size).toBe(n); // every team is placed
  });

  it("prefers pools of 4", () => {
    const { pools } = generateQualifsDay({ teams: teams(8), labelPrefix: "" });
    expect(pools).toHaveLength(2);
  });

  it.each([0, 1, 2, 5])("refuses %i teams", (n) => {
    expect(() => generateQualifsDay({ teams: teams(n), labelPrefix: "" })).toThrow(ConflictError);
  });

  it("continues an existing series of labels", () => {
    const { pools } = generateQualifsDay({ teams: teams(8), labelPrefix: "CAS-A", labelStart: 3 });
    expect(pools.map((p) => p.label)).toEqual(["CAS-A3", "CAS-A4"]);
  });

  it("with leftovers allowed, places what it can", () => {
    const { pools, leftover } = generateQualifsDay({ teams: teams(5), labelPrefix: "", allowLeftovers: true });
    expect(pools).toHaveLength(1);
    expect(leftover).toHaveLength(1);
  });

  it.each([0, 1, 2])("with leftovers allowed, draws nothing from %i teams", (n) => {
    const { pools, leftover } = generateQualifsDay({ teams: teams(n), labelPrefix: "", allowLeftovers: true });
    expect(pools).toHaveLength(0);
    expect(leftover).toHaveLength(n);
  });
});

describe("splitForQualifs", () => {
  const sizes = (groups: Team[][]) => groups.map((g) => g.length);

  it.each([
    [3, [3], 0],
    [4, [4], 0],
    [6, [3, 3], 0],
    [7, [4, 3], 0],
    [8, [4, 4], 0],
    [11, [4, 4, 3], 0],
    [12, [4, 4, 4], 0],
  ])("splits %i teams without leaving anyone out", (n, expected, left) => {
    const { groups, leftover } = splitForQualifs(teams(n));
    expect(sizes(groups)).toEqual(expected);
    expect(leftover).toHaveLength(left);
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
      const input = teams(n);
      const { groups, leftover } = splitForQualifs(input);
      const seen = [...groups.flat(), ...leftover].map((t) => t.id);
      expect(new Set(seen).size).toBe(n);
    }
  });
});
