import type { Criterion, PoolDetails, ReportEvaluation, Team } from "@/types";
import { finalGrade, outOf20, percent, teamResults, writtenReportNotes, type NoteSet, type PassageResult } from "./results";

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
    const written = new Map([["A", set("A", 4.5, 9)]]);
    const a = teamResults(results, WEIGHTS, written).find((t) => t.teamId === "A")!;
    expect([a.notes.defender?.average, a.notes.opponent?.average, a.notes.reporter?.average, a.notes.report?.average]).toEqual([8, 4, 6, 4.5]);
    expect(a.final).toBeCloseTo((9 * 80 + 3 * 40 + 2 * 60 + 5 * 50) / 19);
  });
});

describe("written reports", () => {
  // Problem 1's grid is out of 10, problem 2's out of 20, problem 3 has no
  // grid yet, problem 4's is out of 5. Team A submitted P1, P2 and P3.
  const criteria = [
    { id: "c1", label: "P1", coefficient: 10, type: "report", problemNumber: 1, order: 1 },
    { id: "c2", label: "P2", coefficient: 20, type: "report", problemNumber: 2, order: 1 },
    { id: "c4", label: "P4", coefficient: 5, type: "report", problemNumber: 4, order: 1 },
  ] as Criterion[];
  const team = {
    id: "A",
    reports: [{ id: "r1", problemNumber: 1 }, { id: "r2", problemNumber: 2 }, { id: "r3", problemNumber: 3 }],
  } as Team;
  const QUARTERS = { 1: 25, 2: 25, 3: 25, 4: 25 };
  const evaluation = (juryId: string, problemNumber: number, criterionId: string, score: number) =>
    ({ id: `${juryId}${problemNumber}`, juryId, teamId: "A", problemNumber, globalRemark: null, grades: [{ criterionId, score }] }) as ReportEvaluation;

  it("averages the reports out of 20 with the problems' weights, a missing report counting 0", () => {
    // P1: the duo's two jurors, 6 and 8 out of 10 → 14/20. P2: 15/20.
    // P3 has no grid: left out. P4 was never submitted: 0/20.
    const evals = [evaluation("j1", 1, "c1", 0.6), evaluation("j2", 1, "c1", 0.8), evaluation("j3", 2, "c2", 0.75)];
    const note = writtenReportNotes([team], criteria, evals, QUARTERS).get("A")!;
    expect(note.max).toBe(20);
    expect(note.average).toBeCloseTo((25 * 14 + 25 * 15 + 25 * 0) / 75);
    expect([note.graded, note.submitted, note.missing]).toEqual([2, 2, [4]]);
  });

  it("counts as soon as one report is graded, and follows the weights", () => {
    const one = writtenReportNotes([team], criteria, [evaluation("j1", 1, "c1", 0.7)], QUARTERS).get("A")!;
    expect(one.average).toBeCloseTo((25 * 14 + 25 * 0) / 50); // P1 14/20, P4 missing
    expect(one.graded).toBe(1);
    const heavier = writtenReportNotes([team], criteria, [evaluation("j1", 1, "c1", 0.7)], { 1: 75, 2: 5, 3: 5, 4: 15 }).get("A")!;
    expect(heavier.average).toBeCloseTo((75 * 14) / 90);
  });

  it("waits for a first grade, unless the team submitted nothing", () => {
    expect(writtenReportNotes([team], criteria, [], QUARTERS).get("A")!.average).toBeNull();
    const empty = writtenReportNotes([{ ...team, reports: [] }], criteria, [], QUARTERS).get("A")!;
    expect(empty.average).toBe(0);
    expect(empty.missing).toEqual([1, 2, 4]);
  });

  it("shows a report out of 20 whatever its grid adds up to", () => {
    expect(outOf20({ teamId: "A", max: 8, notes: [{ juryId: "j", total: 6, globalRemark: null }], average: 6 })).toEqual({
      teamId: "A", max: 20, notes: [{ juryId: "j", total: 15, globalRemark: null }], average: 15,
    });
  });
});
