import type { PoolDetails } from "@/types";
import { finalGrade, type FinalPart, type NoteSet, type PassageResult, type TeamResult } from "./results";
import { agreement, jurorAgreement, notePoints, oralGrade, partInfluence, standings, topShift, widestGaps } from "./standings";

const WEIGHTS: Record<FinalPart, number> = { defender: 9, opponent: 3, reporter: 2, report: 5 };

// A note out of 10 (the written report out of 20): 8 reads 80 %
const set = (average: number | null, max = 10): NoteSet => ({ teamId: "", max, notes: [], average });
const team = (teamId: string, defender: number | null, opponent: number | null, reporter: number | null, report: number | null, weights = WEIGHTS): TeamResult => {
  const notes = { defender: set(defender), opponent: set(opponent), reporter: set(reporter), report: report === null ? null : set(report, 20) };
  return { teamId, pool: {} as PoolDetails, notes, final: finalGrade(notes, weights) };
};

//      oral    written  final
// A   71.43     50      65.79
// B   67.86     90      73.68
// C   40        60      45.26
// D   66.43     none    none
const ROWS = [team("A", 8, 6, 5, 10), team("B", 6, 9, 7, 18), team("C", 4, 4, 4, 12), team("D", 9, 2, 3, null)];
const byTeam = (rows = ROWS, weights = WEIGHTS) => new Map(standings(rows, weights).map((s) => [s.teamId, s]));

describe("oral and written", () => {
  it("weighs the three roles of the oral as the final grade does", () => {
    expect(oralGrade(ROWS[0].notes, WEIGHTS)).toBeCloseTo(71.42857142857143, 10);
    // A role weighted 0 doesn't count
    expect(oralGrade(ROWS[0].notes, { ...WEIGHTS, reporter: 0 })).toBeCloseTo((9 * 80 + 3 * 60) / 12, 10);
    // All three at 0: they count alike
    expect(oralGrade(ROWS[0].notes, { defender: 0, opponent: 0, reporter: 0, report: 5 })).toBeCloseTo((80 + 60 + 50) / 3, 10);
    // A role still to grade leaves the oral pending
    expect(oralGrade(team("E", 8, null, 5, 10).notes, WEIGHTS)).toBeNull();
  });

  it("ranks the teams three ways, each among those that have the note", () => {
    const s = byTeam();
    expect(s.get("A")!.notes.oral).toBeCloseTo(71.42857142857143, 10);
    expect(s.get("B")!.notes.final).toBeCloseTo(73.6842105263158, 10);
    expect(s.get("C")!.notes.report).toBe(60);
    expect([..."ABCD"].map((id) => s.get(id)!.ranks.oral)).toEqual([1, 2, 4, 3]);
    expect([..."ABCD"].map((id) => s.get(id)!.ranks.report)).toEqual([3, 1, 2, null]);
    expect([..."ABCD"].map((id) => s.get(id)!.ranks.final)).toEqual([2, 1, 3, null]);
  });

  it("counts the places between a team's two rankings, above 0 when the oral is the better", () => {
    const s = byTeam();
    expect([..."ABCD"].map((id) => s.get(id)!.gap)).toEqual([2, -1, -2, null]);
  });

  it("gives teams with the same note the same place", () => {
    const s = byTeam([team("A", 8, 6, 5, 10), team("B", 8, 6, 5, 10), team("C", 4, 4, 4, 12)]);
    expect([..."ABC"].map((id) => s.get(id)!.ranks.final)).toEqual([1, 1, 3]);
    expect([..."ABC"].map((id) => s.get(id)!.ranks.report)).toEqual([2, 2, 1]);
    expect(s.get("A")!.gap).toBe(1);
  });

  it("pairs two notes of the teams that have both", () => {
    const points = notePoints(standings(ROWS, WEIGHTS), "report", "defender");
    expect(points).toEqual([{ teamId: "A", x: 50, y: 80 }, { teamId: "B", x: 90, y: 60 }, { teamId: "C", x: 60, y: 40 }]);
  });

  it("sums up how the oral and the written report go together", () => {
    const a = agreement(standings(ROWS, WEIGHTS));
    expect(a.count).toBe(3);
    expect(a.pearson).toBeCloseTo(0.17614682203116147, 10); // SciPy
    expect(a.spearman).toBeCloseTo(-0.5, 10);
    expect(a.concordance).toBeCloseTo(1 / 3, 10); // only B and C are in the same order
    expect(a.medianGap).toBe(2);
  });

  it("names the teams the two rankings disagree most about", () => {
    const { oral, written } = widestGaps(standings(ROWS, WEIGHTS), 5);
    expect(oral.map((s) => [s.teamId, s.gap])).toEqual([["A", 2]]);
    expect(written.map((s) => [s.teamId, s.gap])).toEqual([["C", -2], ["B", -1]]);
    expect(widestGaps(standings(ROWS, WEIGHTS), 1).written.map((s) => s.teamId)).toEqual(["C"]);
  });

  it("tells who would stay among the first were one half the only one to count", () => {
    const list = standings(ROWS, WEIGHTS);
    expect(topShift(list, 2, "oral")).toEqual({ top: ["B", "A"], kept: ["B", "A"], out: [], in: [] });
    expect(topShift(list, 2, "report")).toEqual({ top: ["B", "A"], kept: ["B"], out: ["A"], in: ["C"] });
    expect(topShift(list, 1, "oral")).toEqual({ top: ["B"], kept: [], out: ["B"], in: ["A"] });
  });
});

describe("what each part really weighs", () => {
  it("shares out the differences between final grades, the four adding up to 1", () => {
    const parts = partInfluence(standings(ROWS, WEIGHTS), WEIGHTS);
    expect(parts.map((p) => p.part)).toEqual(["defender", "opponent", "reporter", "report"]);
    expect(parts.map((p) => p.weight)).toEqual([9 / 19, 3 / 19, 2 / 19, 5 / 19]);
    // NumPy, on A, B and C (D has no final grade)
    [0.4517374517374514, 0.25289575289575295, 0.0990990990990991, 0.19626769626769636].forEach((share, i) => {
      expect(parts[i].share).toBeCloseTo(share, 10);
    });
    expect(parts.reduce((s, p) => s + p.share!, 0)).toBeCloseTo(1, 10);
  });

  it("says where a share comes from: the part's spread and its link with the final grade", () => {
    const parts = partInfluence(standings(ROWS, WEIGHTS), WEIGHTS);
    // NumPy, on A, B and C
    [16.32993161855452, 20.548046676563253, 12.472191289246473, 16.996731711975947].forEach((spread, i) => {
      expect(parts[i].spread).toBeCloseTo(spread, 10);
    });
    [0.6995586032508209, 0.9337156057125467, 0.9041944301794651, 0.5256277449721677].forEach((link, i) => {
      expect(parts[i].link).toBeCloseTo(link, 10);
    });
    // coefficient × link × spread, over the final grades' standard deviation
    for (const p of parts) expect(p.share).toBeCloseTo((p.weight * p.link! * p.spread!) / 11.978743870253728, 10);
  });

  it("gives nothing to a part weighted 0", () => {
    const weights = { ...WEIGHTS, reporter: 0 };
    const rows = [team("A", 8, 6, 5, 10, weights), team("B", 6, 9, 7, 18, weights), team("C", 4, 4, 4, 12, weights)];
    const parts = partInfluence(standings(rows, weights), weights);
    expect(parts[2]).toMatchObject({ part: "reporter", weight: 0, share: 0 });
    // Its notes still spread, and still go with the final grade or not
    expect(parts[2].spread).toBeCloseTo(12.472191289246473, 10);
    expect(parts[2].link).toBeCloseTo(0.8808122718846412, 10);
    expect(parts[0].share).toBeCloseTo(0.526621, 5);
    expect(parts.reduce((s, p) => s + p.share!, 0)).toBeCloseTo(1, 10);
  });

  it("waits for three graded teams, and for grades that differ", () => {
    expect(partInfluence(standings(ROWS.slice(0, 2), WEIGHTS), WEIGHTS).map((p) => p.share)).toEqual([null, null, null, null]);
    const same = [team("A", 8, 6, 5, 10), team("B", 8, 6, 5, 10), team("C", 8, 6, 5, 10)];
    expect(partInfluence(standings(same, WEIGHTS), WEIGHTS).map((p) => p.share)).toEqual([null, null, null, null]);
  });
});

describe("the jurors of a duo", () => {
  const notes = (teamId: string, max: number, ...totals: number[]): NoteSet =>
    ({ teamId, max, notes: totals.map((total, i) => ({ juryId: `J${i}`, total, globalRemark: null })), average: totals.length ? totals.reduce((s, t) => s + t, 0) / totals.length : null });
  const passage = (id: string, defender: NoteSet, opponent: NoteSet, reporter: NoteSet, report: NoteSet): PassageResult =>
    ({ passage: { id, label: id }, oral: { defender, opponent, reporter }, report }) as unknown as PassageResult;

  const results = [
    passage("P1", notes("A", 10, 8, 6), notes("B", 10, 7), notes("C", 9, 9, 4.5), notes("A", 20, 15, 12)),
    passage("P2", notes("D", 10, 5, 5, 9), notes("E", 10), notes("F", 9, 6, 6), notes("D", 20, 10)),
  ];

  it("measures how far apart the notes of one performance are, in points of its grid", () => {
    const [defender, opponent, reporter, report] = jurorAgreement(results);
    // P2: three jurors, from 5 to 9 out of 10; P1: 8 and 6
    expect(defender.gaps).toEqual([
      { key: "P2:defender", teamId: "D", passage: "P2", jurors: 3, gap: 40 },
      { key: "P1:defender", teamId: "A", passage: "P1", jurors: 2, gap: 20 },
    ]);
    expect(defender.summary).toMatchObject({ count: 2, mean: 30, max: 40 });
    expect(reporter.gaps.map((g) => g.gap)).toEqual([50, 0]);
    expect(report.gaps).toEqual([{ key: "P1:report", teamId: "A", passage: "P1", jurors: 2, gap: 15 }]);
    // A single juror, or none: nothing to compare
    expect(opponent).toEqual({ part: "opponent", gaps: [], summary: null });
  });
});
