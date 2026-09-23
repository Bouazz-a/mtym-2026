import { describe, expect, it } from "vitest";
import { generateBothRoundsOptimal } from "./finaleDraw";

const teams = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `team-${i}`, quadrigram: `T${i}` }));

describe("generateBothRoundsOptimal (finale, not wired yet)", () => {
  const { round1, round2, report } = generateBothRoundsOptimal({ teams: teams(9), poolSize: 3, problemPool: [1, 2, 3, 4] });

  it("places every team once in each round", () => {
    for (const round of [round1, round2]) {
      const defenders = round.flatMap((pool) => pool.passages.map((p) => p.defenderTeamId));
      expect(new Set(defenders).size).toBe(9);
      for (const pool of round) expect(pool.passages).toHaveLength(3);
    }
    expect(round1.map((p) => p.label)).toEqual(["A1", "A2", "A3"]);
    expect(round2.map((p) => p.label)).toEqual(["B1", "B2", "B3"]);
  });

  it("never lets a team defend the same problem twice (DD)", () => {
    const defended = new Map(round1.flatMap((pool) => pool.passages.map((p) => [p.defenderTeamId, p.problemNumber] as const)));
    for (const p of round2.flatMap((pool) => pool.passages)) {
      expect(p.problemNumber).not.toBe(defended.get(p.defenderTeamId));
    }
  });

  it("reports a score equal to its violations", () => {
    expect(report.totalScore).toBe(report.violations.reduce((s, v) => s + v.weight, 0));
  });
});
