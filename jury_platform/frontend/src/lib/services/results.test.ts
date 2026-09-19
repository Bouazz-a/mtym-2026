import type { PoolDetails } from "@/types";
import { finalGrade, percent, teamResults, type NoteSet, type PassageResult } from "./results";

const WEIGHTS = { defender: 9, opponent: 3, reporter: 2, report: 5 };
const set = (teamId: string, average: number | null, max = 10): NoteSet => ({ teamId, max, notes: [], average });

describe("final grade", () => {
  it("expresses a note as a percentage of its grid", () => {
    expect(percent(set("t", 2.5))).toBe(25);
    expect(percent(set("t", 4.5, 9))).toBe(50);
    expect(percent(set("t", null))).toBeNull();
  });

  it("is the weighted average of the four percentages", () => {
    const notes = { defender: set("t", 8), opponent: set("t", 6), reporter: set("t", 5), report: set("t", 4.5, 9) };
    // (9×80 + 3×60 + 2×50 + 5×50) / 19
    expect(finalGrade(notes, WEIGHTS)).toBeCloseTo((720 + 180 + 100 + 250) / 19);
  });

  it("waits for every weighted note, but ignores a part weighted 0", () => {
    const notes = { defender: set("t", 8), opponent: set("t", 6), reporter: set("t", 5), report: set("t", null) };
    expect(finalGrade(notes, WEIGHTS)).toBeNull();
    expect(finalGrade(notes, { ...WEIGHTS, report: 0 })).toBeCloseTo((720 + 180 + 100) / 14);
  });

  it("gathers each team's notes from the passages where it holds each role", () => {
    const pool = { id: "p", label: "CAS-A1" } as PoolDetails;
    // pool of 3: A defends in P1, B in P2, C in P3 (roles rotate)
    const passage = (def: string, opp: string, rap: string, notes: number[]): PassageResult =>
      ({
        pool,
        passage: {},
        oral: { defender: set(def, notes[0]), opponent: set(opp, notes[1]), reporter: set(rap, notes[2]) },
        report: set(def, notes[3], 9),
      }) as unknown as PassageResult;
    const results = [
      passage("A", "B", "C", [8, 6, 5, 4.5]),
      passage("B", "C", "A", [7, 5, 6, 9]),
      passage("C", "A", "B", [5, 4, 3, 0]),
    ];
    const a = teamResults(results, WEIGHTS).find((t) => t.teamId === "A")!;
    expect([a.notes.defender?.average, a.notes.opponent?.average, a.notes.reporter?.average, a.notes.report?.average]).toEqual([8, 4, 6, 4.5]);
    expect(a.final).toBeCloseTo((9 * 80 + 3 * 40 + 2 * 60 + 5 * 50) / 19);
  });
});
