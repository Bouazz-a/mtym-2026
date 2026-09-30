import type { Account, CenterDay, OralEvaluation, PassageDetails, PoolDetails, ReportAssignmentBoard, Team } from "@/types";
import {
  choiceCounts, countdown, dayChecks, dayOrder, jurorLoads, localDate, problemRows, scoped, since, sortJurors, stages,
} from "./dashboard";

const team = (id: string, center: Team["center"], extra: Partial<Team> = {}): Team => ({
  id, sourceId: 0, name: id, quadrigram: id, center, members: [], centerDayId: `${center}-d1`, reports: [], problemRanking: [], ...extra,
});
const day = (center: CenterDay["center"], date: string, validated = false): CenterDay => ({
  id: `${center}-d1`, center, date, schedule: [], drawValidatedAt: validated ? "2026-09-20T10:00:00Z" : null, drawValidatedBy: validated ? "Ines" : null, _count: { teams: 0, pools: 0 },
});
const juror = (id: string) => ({ id, firstName: id, lastName: "J", email: `${id}@t` });
const passage = (id: string, problem: number, [d, o, r]: string[], duo: string[] | null): PassageDetails => ({
  id, label: id, problemNumber: problem, poolId: "p", defenderTeamId: d, opponentTeamId: o, reporterTeamId: r, extraTeamId: null, slot: 1, room: null,
  duoId: duo ? "duo" : null, duo: duo && { id: "duo", centerDayId: "x", number: 1, problemNumber: null, members: duo.map(juror) },
} as PassageDetails);
const pool = (center: CenterDay["center"], passages: PassageDetails[]): PoolDetails => ({
  id: `${center}-pool`, label: "A1", round: 1, centerDayId: `${center}-d1`, draft: null, centerDay: day(center, "2026-10-03"), passages,
} as PoolDetails);

// Casablanca: A, B, C in one pool (A P1, B P2, C P3), and D without a day; Rabat: R, no pool
const teams = [
  team("A", "casablanca", { problemRanking: [1, 2, 3, 4], reports: [{ id: "a2", problemNumber: 2 }] }),
  team("B", "casablanca", { problemRanking: [1, 2, 3, 4] }),
  team("C", "casablanca", { problemRanking: [3, 1, 2, 4], reports: [{ id: "c1", problemNumber: 1 }] }),
  team("D", "casablanca", { centerDayId: null }),
  team("R", "rabat"),
];
const pools = [pool("casablanca", [
  passage("x1", 1, ["A", "B", "C"], ["j1", "j2"]),
  passage("x2", 2, ["B", "C", "A"], ["j1", "j2", "j3"]),
  passage("x3", 3, ["C", "A", "B"], null),
])];
const board: ReportAssignmentBoard = {
  reports: [
    { id: "r1", teamId: "A", problemNumber: 2, accountId: "j1", graded: true },
    { id: "r2", teamId: "C", problemNumber: 1, accountId: "j2", graded: false },
    { id: "r3", teamId: "B", problemNumber: 4, accountId: null, graded: false },
    { id: "r4", teamId: "R", problemNumber: 1, accountId: "j1", graded: false },
  ],
  pendingDays: [],
  jurors: [],
} as ReportAssignmentBoard;
const oral = (passageId: string, juryId: string): OralEvaluation => ({ id: `${passageId}${juryId}`, juryId, passageId, teamId: "A", role: "defender", globalRemark: null, grades: [] });
const orals = [oral("x1", "j1"), oral("x1", "j2"), oral("x2", "j3")];
const data = { teams, days: [day("casablanca", "2026-10-03", true), day("rabat", "2026-10-10")], pools, board, orals };

describe("dashboard figures", () => {
  it("narrows everything to one center", () => {
    const casa = scoped(data, "casablanca");
    expect(casa.teams.map((t) => t.id)).toEqual(["A", "B", "C", "D"]);
    expect(casa.days).toHaveLength(1);
    expect(casa.board!.reports.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    expect(scoped(data, null)).toBe(data);
  });

  it("counts every stage of the tournament", () => {
    const by = Object.fromEntries(stages(scoped(data, "casablanca"), "?centre=casablanca").map((s) => [s.key, `${s.done}/${s.total}`]));
    expect(by).toEqual({
      days: "3/4", // D has no day
      pools: "3/3",
      draws: "1/1",
      duos: "2/3",
      assigned: "2/3",
      graded: "1/2",
      orals: "3/15", // 2 jurors × 3 + 3 jurors × 3 expected
    });
  });

  it("marks the stages whose data is still loading", () => {
    const s = stages({ teams, days: [], pools }, "");
    expect(s.filter((x) => x.loading).map((x) => x.key)).toEqual(["assigned", "graded", "orals"]);
  });

  it("counts, per problem, its defenses, the first choices of the teams in a pool, and the reports", () => {
    const withD = [...teams.slice(0, 4).map((t) => (t.id === "D" ? { ...t, problemRanking: [4, 3, 2, 1] } : t)), teams[4]];
    expect(problemRows(withD, pools)).toEqual([
      { problem: 1, defended: 1, firstChoice: 2, reports: 1, missing: 4 },
      { problem: 2, defended: 1, firstChoice: 0, reports: 1, missing: 4 },
      { problem: 3, defended: 1, firstChoice: 1, reports: 0, missing: 5 },
      { problem: 4, defended: 0, firstChoice: 0, reports: 0, missing: 5 }, // D ranks P4 first, but plays in no pool
    ]);
  });

  it("counts which choice each defender plays", () => {
    // A defends P1 (its 1st), B P2 (2nd), C P3 (1st)
    expect(choiceCounts(teams, pools)).toEqual([
      { rank: 1, count: 2 }, { rank: 2, count: 1 }, { rank: 3, count: 0 }, { rank: 4, count: 0 }, { rank: null, count: 0 },
    ]);
  });

  it("says when a day is, and picks the next one", () => {
    expect(countdown("2026-10-03", "2026-10-03")).toBe("Aujourd'hui");
    expect(countdown("2026-10-04", "2026-10-03")).toBe("Demain");
    expect(countdown("2026-10-10", "2026-10-03")).toBe("Dans 7 jours");
    expect(countdown("2026-09-26", "2026-10-03")).toBe("Il y a 7 jours");
    const days = [day("rabat", "2026-10-10"), day("casablanca", "2026-09-26"), day("fez", "2026-10-03")];
    expect(dayOrder(days, "2026-09-30")).toMatchObject({ focus: 1 });
    expect(dayOrder(days, "2026-09-30").days.map((d) => d.date)).toEqual(["2026-09-26", "2026-10-03", "2026-10-10"]);
    expect(dayOrder(days, "2026-12-01").focus).toBe(2); // all past: the last one
    expect(localDate(new Date(2026, 8, 5))).toBe("2026-09-05");
  });

  it("lists what a day still needs", () => {
    const checks = dayChecks(data.days[0], scoped(data, "casablanca"));
    const by = Object.fromEntries(checks.map((c) => [c.key, `${c.state} ${c.done}/${c.total}${c.note ? ` (${c.note})` : ""}`]));
    expect(by).toEqual({
      pools: "done 3/3",
      draw: "done 1/1 (par Ines)",
      duos: "todo 2/3",
      mail: "todo 0/0",
      reports: "todo 1/2 (1 sans juré)",
      orals: "todo 3/15",
    });
    const unvalidated = dayChecks(day("casablanca", "2026-10-03"), scoped(data, "casablanca"));
    expect(unvalidated.find((c) => c.key === "mail")).toMatchObject({ state: "later", note: "après la validation" });
    // The orals open on the day itself; a day without teams has nothing to do
    const before = dayChecks(data.days[0], scoped(data, "casablanca"), undefined, "2026-09-30");
    expect(before.find((c) => c.key === "orals")).toMatchObject({ state: "later", note: "le jour même" });
    const on = dayChecks(data.days[0], scoped(data, "casablanca"), undefined, "2026-10-03");
    expect(on.find((c) => c.key === "orals")).toMatchObject({ state: "todo" });
    const empty = dayChecks(day("fez", "2026-10-03"), data);
    expect(empty.find((c) => c.key === "pools")).toMatchObject({ state: "later", note: "aucune équipe ce jour" });
  });

  it("measures each juror's load, and sorts it", () => {
    const accounts = ["j1", "j2", "j3", "j4"].map((id) => ({ ...juror(id), role: "jury", isJuror: true }) as Account);
    const loads = jurorLoads(accounts, data);
    expect(loads).toEqual([
      { id: "j1", name: "j1 J", assigned: 2, graded: 1, passages: 2 },
      { id: "j2", name: "j2 J", assigned: 1, graded: 0, passages: 2 },
      { id: "j3", name: "j3 J", assigned: 0, graded: 0, passages: 1 },
    ]); // j4 has nothing
    expect(sortJurors(loads, "left").map((j) => j.id)).toEqual(["j1", "j2", "j3"]);
    expect(sortJurors(loads, "load").map((j) => j.id)).toEqual(["j1", "j2", "j3"]);
    expect(sortJurors(loads, "name").map((j) => j.id)).toEqual(["j1", "j2", "j3"]);
  });

  it("says how long ago", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    expect(since("2026-09-30T11:59:40Z", now)).toBe("à l'instant");
    expect(since("2026-09-30T11:55:00Z", now)).toBe("il y a 5 min");
    expect(since("2026-09-30T09:00:00Z", now)).toBe("il y a 3 h");
    expect(since("2026-09-29T09:00:00Z", now)).toBe("hier");
    expect(since("2026-09-26T09:00:00Z", now)).toBe("il y a 4 j");
  });
});
