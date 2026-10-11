import type { Criterion, ReportEvaluation } from "@/types";
import { easiestProblem, problemStats } from "./problemStats";
import type { NoteSet, PassageResult } from "./results";

const set = (teamId: string, average: number | null, max = 10): NoteSet => ({ teamId, max, notes: [], average });
const passage = (label: string, problemNumber: number, def: [string, number | null], opp: [string, number | null], rap: [string, number | null]): PassageResult =>
  ({
    passage: { label, problemNumber },
    oral: { defender: set(...def), opponent: set(...opp), reporter: set(...rap) },
  }) as unknown as PassageResult;

const results = [
  passage("CAS-A1P1", 1, ["A", 8], ["B", 6], ["C", 5]),
  passage("CAS-A2P1", 1, ["D", 4], ["E", 9], ["F", null]),
  passage("CAS-A1P2", 2, ["B", 7], ["C", 3], ["A", 6]),
  passage("CAS-A1P3", 3, ["C", null], ["A", null], ["B", null]),
];

describe("problem by problem", () => {
  it("files each oral under the problem of its passage, best first", () => {
    const stats = problemStats("defender", results, [], [], []);
    expect(stats.map((s) => s.problem)).toEqual([1, 2, 3, 4]);
    expect(stats[0].entries).toEqual([{ teamId: "A", value: 80, passage: "CAS-A1P1" }, { teamId: "D", value: 40, passage: "CAS-A2P1" }]);
    expect(stats[0].summary).toMatchObject({ count: 2, mean: 60, min: 40, max: 80, stdDev: 20 });
    expect(stats[1].entries).toEqual([{ teamId: "B", value: 70, passage: "CAS-A1P2" }]);
  });

  it("grades the opponent and the reporter on the defender's problem", () => {
    expect(problemStats("opponent", results, [], [], [])[0].entries.map((e) => [e.teamId, e.value])).toEqual([["E", 90], ["B", 60]]);
    expect(problemStats("reporter", results, [], [], [])[0].entries.map((e) => e.teamId)).toEqual(["C"]); // F isn't graded yet
  });

  it("has nothing to say about a problem nobody is graded on", () => {
    const stats = problemStats("defender", results, [], [], []);
    expect(stats[2]).toEqual({ problem: 3, entries: [], summary: null });
    expect(stats[3]).toEqual({ problem: 4, entries: [], summary: null });
  });

  it("averages the jurors of each team's written report on the problem", () => {
    const criteria = [
      { id: "w1", label: "P1", coefficient: 40, type: "report", problemNumber: 1, order: 1 },
      { id: "w2", label: "P2", coefficient: 10, type: "report", problemNumber: 2, order: 1 },
    ] as Criterion[];
    const note = (juryId: string, teamId: string, problemNumber: number, score: number): ReportEvaluation =>
      ({ id: `${juryId}${teamId}${problemNumber}`, juryId, teamId, problemNumber, globalRemark: null, grades: [{ id: "g", criterionId: `w${problemNumber}`, score, remark: null }] });
    const report = [note("j1", "A", 1, 0.5), note("j2", "A", 1, 1), note("j1", "B", 1, 0.9), note("j1", "A", 2, 0.2), note("j1", "GONE", 1, 1), note("j1", "A", 3, 1)];
    const stats = problemStats("report", [], [{ id: "A" }, { id: "B" }], criteria, report);
    expect(stats[0].entries).toEqual([{ teamId: "B", value: 90 }, { teamId: "A", value: 75 }]); // a team no longer there is left out
    expect(stats[1].entries).toEqual([{ teamId: "A", value: 20 }]);
    expect(stats[2].entries).toEqual([]); // problem 3 has no grid
  });

  it("names the problem with the highest average, once two are graded", () => {
    expect(easiestProblem(problemStats("defender", results, [], [], []))?.problem).toBe(2); // 70 against 60
    expect(easiestProblem(problemStats("reporter", results, [], [], []))?.problem).toBe(2); // 60 against 50
    expect(easiestProblem(problemStats("defender", results.slice(0, 2), [], [], []))).toBeNull(); // only problem 1
  });
});
