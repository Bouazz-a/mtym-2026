import type { Criterion, OralEvaluation, PoolDetails, ReportEvaluation } from "@/types";
import { jurorSheets } from "./jurorNotes";

// One grid of 10 points per oral role, and one of 40 for problem 1's reports
const criteria = [
  { id: "d", label: "Défense", coefficient: 10, type: "oral", role: "defender", order: 1 },
  { id: "o", label: "Opposition", coefficient: 10, type: "oral", role: "opponent", order: 1 },
  { id: "r", label: "Rapport oral", coefficient: 10, type: "oral", role: "reporter", order: 1 },
  { id: "w1", label: "P1", coefficient: 40, type: "report", problemNumber: 1, order: 1 },
  { id: "w2", label: "P2", coefficient: 40, type: "report", problemNumber: 2, order: 1 },
] as Criterion[];

const juror = (id: string) => ({ id, firstName: id.toUpperCase(), lastName: "Juré", isJuror: true });
const accounts = [juror("ana"), juror("bob"), juror("cy"), { id: "adm", firstName: "Ad", lastName: "Min", isJuror: false }];

// A pool of one passage (A defends problem 1, B opposes, C reports), judged by Ana and Bob
const pool = {
  id: "pool",
  label: "CAS-A1",
  centerDay: { id: "day", center: "casablanca", date: "2026-10-03", schedule: [] },
  passages: [{
    id: "p1", label: "CAS-A1P1", slot: 1, problemNumber: 1, poolId: "pool",
    defenderTeamId: "A", opponentTeamId: "B", reporterTeamId: "C",
    duo: { id: "duo", centerDayId: "day", number: 1, problemNumber: 1, members: [{ id: "ana" }, { id: "bob" }] },
  }],
} as unknown as PoolDetails;

const oralNote = (juryId: string, teamId: string, criterionId: string, score: number, globalRemark: string | null = null): OralEvaluation =>
  ({ id: `${juryId}-${teamId}`, juryId, passageId: "p1", teamId, role: "defender", globalRemark, grades: [{ id: "g", criterionId, score, remark: null }] });
const reportNote = (juryId: string, teamId: string, problemNumber: number, score: number): ReportEvaluation =>
  ({ id: `${juryId}-${teamId}-${problemNumber}`, juryId, teamId, problemNumber, globalRemark: null, grades: [{ id: "g", criterionId: `w${problemNumber}`, score, remark: null }] });

describe("what each juror did", () => {
  const oral = [oralNote("ana", "A", "d", 0.8, "Solide"), oralNote("bob", "A", "d", 0.6), oralNote("ana", "B", "o", 0.5)];
  const report = [reportNote("ana", "A", 1, 0.5), reportNote("bob", "A", 1, 0.75), reportNote("cy", "D", 2, 1), reportNote("cy", "A", 1, 0.25)];
  // Cy holds D's report on problem 2, and E's, not graded yet
  const assigned = [
    { teamId: "D", problemNumber: 2, accountId: "cy" },
    { teamId: "E", problemNumber: 2, accountId: "cy" },
    { teamId: "F", problemNumber: 2, accountId: null },
  ];
  const sheets = jurorSheets(accounts, [pool], criteria, oral, report, assigned);
  const sheet = (id: string) => sheets.find((s) => s.id === id)!;

  it("lists the jurors who have something to grade, by name", () => {
    expect(sheets.map((s) => s.name)).toEqual(["ANA Juré", "BOB Juré", "CY Juré"]);
  });

  it("owes a duo's juror the three orals and the defended report of each passage", () => {
    const ana = sheet("ana");
    expect(ana.passages).toBe(1);
    expect(ana.centers).toEqual(["casablanca"]);
    expect(ana.tasks.map((t) => [t.kind, t.teamId, t.origin])).toEqual([
      ["oral", "A", "passage"], ["oral", "B", "passage"], ["oral", "C", "passage"], ["report", "A", "passage"],
    ]);
    expect(ana.orals).toEqual({ done: 2, expected: 3 });
    expect(ana.reports).toEqual({ done: 1, expected: 1 });
    expect(ana.all).toEqual({ done: 3, expected: 4 });
  });

  it("reads each note out of its grid, a written report out of 20", () => {
    const [defense, , reporter, written] = sheet("ana").tasks;
    expect([defense.total, defense.max, defense.percent, defense.remark]).toEqual([8, 10, 80, "Solide"]);
    expect([reporter.total, reporter.max, reporter.percent, reporter.evaluation]).toEqual([null, 10, null, null]);
    expect([written.total, written.max, written.percent]).toEqual([10, 20, 50]);
  });

  it("sets each note against the other jurors' on the same thing", () => {
    const [defense, opposition, , written] = sheet("ana").tasks;
    expect(defense.others).toBe(60); // Bob's
    expect(opposition.others).toBeNull(); // nobody else graded B
    expect(written.others).toBe(50); // Bob's 75 and Cy's 25
    // Ana: 80 against 60, and 50 against 50; her 50 on B has nothing to compare to
    expect(sheet("ana").gap).toBe(10);
    expect(sheet("ana").meanPercent).toBe(60);
    expect(sheet("bob").gap).toBeCloseTo(((60 - 80) + (75 - 37.5)) / 2);
  });

  it("adds the reports handed to a juror, graded or not", () => {
    const cy = sheet("cy");
    expect(cy.tasks.filter((t) => t.origin === "assigned").map((t) => [t.teamId, t.total])).toEqual([["D", 20], ["E", null]]);
    expect(cy.reports).toEqual({ done: 1, expected: 2 });
  });

  it("keeps apart a note that nothing asks for any more", () => {
    const cy = sheet("cy");
    // Cy graded A's report on problem 1 without judging A's defense nor holding the report
    expect(cy.tasks.filter((t) => t.origin === "stray").map((t) => t.key)).toEqual(["report:A:1"]);
    expect(cy.strays).toBe(1);
    expect(cy.all).toEqual({ done: 1, expected: 2 }); // the stray isn't owed
    expect(sheet("ana").strays).toBe(0);
  });
});
