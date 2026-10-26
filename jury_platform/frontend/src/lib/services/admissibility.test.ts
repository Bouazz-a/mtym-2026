import type { AdmissibleList, Criterion, PoolDetails, ReportEvaluation, Team } from "@/types";
import { admissibilityRows, admissibleCount, cut, drift, inRankOrder, lambdaMax, outsideList, parseSelection } from "./admissibility";
import { writtenReportNotes, type NoteSet, type PassageResult } from "./results";

const WEIGHTS = { defender: 9, opponent: 3, reporter: 2, report: 5 };
const set = (teamId: string, average: number | null, max = 10): NoteSet => ({ teamId, max, notes: [], average });
const pool = { id: "pool", label: "CAS-A1", passages: [] } as unknown as PoolDetails;
// A pool of 3: A defends problem 1, B problem 2, C problem 3; each passage's
// notes are [defender, opponent, reporter, defended report /20]
const passage = (def: string, opp: string, rap: string, problemNumber: number, notes: (number | null)[]): PassageResult =>
  ({
    pool,
    passage: { defenderTeamId: def, problemNumber },
    oral: { defender: set(def, notes[0]), opponent: set(opp, notes[1]), reporter: set(rap, notes[2]) },
    report: set(def, notes[3], 20),
  }) as unknown as PassageResult;

describe("admissibility", () => {
  const results = [
    passage("A", "B", "C", 1, [8, 6, 5, 10]),
    passage("B", "C", "A", 2, [7, 5, 6, 18]),
    passage("C", "A", "B", 3, [5, 4, 3, null]), // C's defended report isn't graded yet
  ];
  const teams = ["A", "B", "C"].map((id) => ({ id, reports: [1, 2, 3, 4].map((p) => ({ id: `${id}${p}`, problemNumber: p })) }));
  const rows = admissibilityRows(results, WEIGHTS, teams);
  const row = (id: string) => rows.find((r) => r.teamId === id)!;

  it("weighs the three orals and the defended report only", () => {
    // A: defense 80, opposition 40, reporter 60, defended report 50
    expect(row("A").notes).toEqual({ defender: 80, opponent: 40, reporter: 60, report: 50 });
    expect(row("A").note).toBeCloseTo((9 * 80 + 3 * 40 + 2 * 60 + 5 * 50) / 19);
    expect(row("A").problem).toBe(1);
  });

  it("ranks the teams with a note, and says what the others miss", () => {
    expect([row("A").rank, row("B").rank]).toEqual([2, 1]);
    expect(row("C")).toMatchObject({ note: null, rank: null, missing: ["report"] });
    expect(inRankOrder(rows, () => 0).map((r) => r.teamId)).toEqual(["B", "A", "C"]);
  });

  it("counts 0 for a defended report that was never submitted", () => {
    const without = teams.map((t) => (t.id === "C" ? { ...t, reports: t.reports.filter((r) => r.problemNumber !== 3) } : t));
    const c = admissibilityRows(results, WEIGHTS, without).find((r) => r.teamId === "C")!;
    expect(c.notes.report).toBe(0);
    expect(c.note).toBeCloseTo((9 * 50 + 3 * 50 + 2 * 50 + 5 * 0) / 19); // C: defense 50, opposition 50 (B's passage), reporter 50 (A's)
    expect(c.missing).toEqual([]);
  });

  it("works λ max out from the teams that played and n", () => {
    expect(lambdaMax(134, 35)).toBeCloseTo(3.8286, 4);
    expect(lambdaMax(70, 35)).toBe(2);
  });

  it("reads n and λ as typed, λ capped at λ max", () => {
    expect(parseSelection("35", "2", 134)).toEqual({ places: 35, lambda: 2, lambdaMax: 134 / 35, error: null });
    expect(parseSelection(" 35 ", "1,5", 134)).toMatchObject({ lambda: 1.5, error: null });
    expect(parseSelection("35", "3,83", 134).error).toBe("lambda"); // 134,05 teams: one too many
    expect(parseSelection("35", "3,8", 134).error).toBeNull();
    expect(parseSelection("35", "2", 70).error).toBeNull(); // exactly every team
    expect(parseSelection("35", "0", 134).error).toBe("lambda");
    expect(parseSelection("35", "abc", 134).error).toBe("lambda");
    expect(parseSelection("3,5", "2", 134)).toMatchObject({ error: "places", lambdaMax: null });
    expect(parseSelection("", "2", 134).error).toBe("places");
    expect(parseSelection("200", "1", 134).error).toBe("places"); // more places than teams
  });

  it("makes λ × n whole teams", () => {
    expect(admissibleCount(35, 2)).toBe(70);
    expect(admissibleCount(35, 1.5)).toBe(52);
    expect(admissibleCount(10, 0.3)).toBe(3); // not 2 because of 0.30000000000000004
  });

  it("cuts after the first places, letting in the teams tied with the last", () => {
    const tied = [
      { teamId: "A", rank: 1 }, { teamId: "B", rank: 2 }, { teamId: "C", rank: 2 }, { teamId: "D", rank: 4 }, { teamId: "E", rank: null },
    ] as Parameters<typeof cut>[0];
    expect([...cut(tied, 2)]).toEqual(["A", "B", "C"]);
    expect([...cut(tied, 1)]).toEqual(["A"]);
    expect(cut(tied, 10).has("E")).toBe(false); // without a note, never in
  });

  it("tells who would enter or leave since the list was fixed", () => {
    expect(drift(["A", "B", "C"], new Set(["A", "C", "D"]))).toEqual({ enter: ["D"], leave: ["B"] });
  });
});

describe("the reports of the teams left out", () => {
  // Every grid out of 10, every problem weighing 25 %
  const criteria = [1, 2, 3, 4].map((p) => ({ id: `c${p}`, label: `P${p}`, coefficient: 10, type: "report", problemNumber: p, order: 1 })) as Criterion[];
  const weights = { 1: 25, 2: 25, 3: 25, 4: 25 };
  const team = (id: string, problems: number[]) => ({ id, reports: problems.map((p) => ({ id: `${id}${p}`, problemNumber: p })) }) as unknown as Team;
  const note = (teamId: string, problemNumber: number, score: number): ReportEvaluation =>
    ({ id: `${teamId}${problemNumber}`, juryId: "j", teamId, problemNumber, globalRemark: null, grades: [{ id: "g", criterionId: `c${problemNumber}`, score, remark: null }] });
  const teams = [team("IN", [1, 2, 3, 4]), team("OUT", [1, 2, 3])];
  const report = [note("IN", 1, 1), note("IN", 2, 0.5), note("OUT", 1, 0.8), note("OUT", 2, 1), note("OUT", 3, 1)];
  const pools = [{ passages: [{ defenderTeamId: "IN", problemNumber: 1 }, { defenderTeamId: "OUT", problemNumber: 1 }] }] as unknown as PoolDetails[];
  const list = { places: 1, lambda: 1, teamIds: ["IN"], fixedAt: "", fixedBy: "" } as AdmissibleList;

  it("count 0, the defended report aside, once the list is fixed", () => {
    const written = writtenReportNotes(teams, criteria, report, weights, outsideList(list, pools));
    // OUT: P1 defended 16/20, P2 and P3 graded but counted 0, P4 never submitted
    expect(written.get("OUT")).toMatchObject({ average: 4, zeroed: [2, 3], missing: [4], graded: 1, submitted: 1 });
    // IN is untouched: 20 and 10, the two others not graded yet
    expect(written.get("IN")).toMatchObject({ average: 15, zeroed: [], graded: 2, submitted: 4 });
  });

  it("weigh nothing with « rapport défendu seulement », their notes kept", () => {
    const defended = new Map([["IN", 1], ["OUT", 1]]);
    const written = writtenReportNotes(teams, criteria, report, weights, undefined, defended);
    // Only P1 counts: IN 20/20, OUT 16/20; nothing counted 0
    expect(written.get("IN")).toMatchObject({ average: 20, ignored: [2, 3, 4], zeroed: [], missing: [] });
    expect(written.get("OUT")).toMatchObject({ average: 16, ignored: [2, 3, 4], missing: [] });
    // A team that never played has nothing left to count
    expect(writtenReportNotes(teams, criteria, report, weights, undefined, new Map()).get("IN")!.average).toBeNull();
  });

  it("count as graded while no list is fixed", () => {
    expect(outsideList(null, pools)).toBeUndefined();
    const written = writtenReportNotes(teams, criteria, report, weights, outsideList(null, pools));
    expect(written.get("OUT")).toMatchObject({ average: (16 + 20 + 20 + 0) / 4, zeroed: [] });
  });
});
