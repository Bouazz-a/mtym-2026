import { generateQualifsDay, QUALIFS_PROBLEMS } from "./tournamentOptimizer";
import { ConflictError } from "./errors";
import type { Team } from "@/types";
import { PASSAGE_SLOTS } from "@/utils/schedule";

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
        expect(p.timeSlot).toBe(PASSAGE_SLOTS[i].start);
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
});
