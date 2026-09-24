import { describe, expect, it } from "vitest";
import { planReportAssignment, type AssignJuror, type AssignReport } from "./reportAssignment";

// `counts[p]` open reports of problem p + 1 ("P1-0", "P1-1"…)
const reports = (...counts: number[]): AssignReport[] =>
  counts.flatMap((n, p) =>
    Array.from({ length: n }, (_, i) => ({ id: `P${p + 1}-${i}`, problemNumber: p + 1, accountId: null, locked: false })),
  );

// "A:1" = juror A, specialist of problem 1; "C:1,2" = of problems 1 and 2
const jurors = (...specs: string[]): AssignJuror[] =>
  specs.map((s) => {
    const [id, problems] = s.split(":");
    return { id, problems: problems.split(",").map(Number) };
  });

// accountId per report id, after applying the plan
function applied(rs: AssignReport[], plan: ReturnType<typeof planReportAssignment>) {
  const out = new Map(rs.map((r) => [r.id, r.accountId]));
  for (const c of plan.changes) out.set(c.reportId, c.accountId);
  return out;
}

function loads(rs: AssignReport[], plan: ReturnType<typeof planReportAssignment>) {
  const out: Record<string, number> = {};
  for (const accountId of applied(rs, plan).values()) if (accountId) out[accountId] = (out[accountId] ?? 0) + 1;
  return out;
}

describe("planReportAssignment", () => {
  it("gives every juror the same number of reports, all of their own problem", () => {
    const rs = reports(5, 5, 5, 5);
    const plan = planReportAssignment(rs, jurors("A:1", "B:2", "C:3", "D:4"), "replace");
    expect(loads(rs, plan)).toEqual({ A: 5, B: 5, C: 5, D: 5 });
    expect(plan.offSpecialty).toBe(0);
    expect(plan.unassigned).toBe(0);
    for (const [id, accountId] of applied(rs, plan)) {
      expect(accountId).toBe({ 1: "A", 2: "B", 3: "C", 4: "D" }[Number(id[1])]);
    }
  });

  it("keeps loads equal and sends only the overflow outside the specialists", () => {
    // 9 reports of P1 for 2 specialists, 3 of P2 for 2: 3 each, so 3 P1
    // reports have to go to the P2 jurors
    const rs = reports(9, 3);
    const plan = planReportAssignment(rs, jurors("A:1", "B:1", "C:2", "D:2"), "replace");
    expect(loads(rs, plan)).toEqual({ A: 3, B: 3, C: 3, D: 3 });
    expect(plan.offSpecialty).toBe(3);
    const byId = applied(rs, plan);
    for (const [id, accountId] of byId) {
      if (id.startsWith("P2")) expect(["C", "D"]).toContain(accountId);
    }
  });

  it("gives the extra report to the jurors for whom it avoids leaving the specialists", () => {
    // 10 reports for 4 jurors: two get 3, two get 2. P1 has 6 for A and B,
    // so A and B are the ones taking 3.
    const rs = reports(6, 4);
    const plan = planReportAssignment(rs, jurors("A:1", "B:1", "C:2", "D:2"), "replace");
    expect(loads(rs, plan)).toEqual({ A: 3, B: 3, C: 2, D: 2 });
    expect(plan.offSpecialty).toBe(0);
  });

  it("keeps the ±1 even when that sends more reports outside the specialists", () => {
    // 7 P1 reports, 3 jurors: loads 3/2/2. Filling the P1 specialists to 3
    // each would leave C with a single report.
    const rs = reports(7);
    const plan = planReportAssignment(rs, jurors("A:1", "B:1", "C:2"), "replace");
    expect(Object.values(loads(rs, plan)).sort()).toEqual([2, 2, 3]);
    expect(plan.offSpecialty).toBe(2);
  });

  it("stays within ±1 on a tournament-sized pool with an uneven problem", () => {
    const rs = reports(57, 57, 57, 29);
    const js = jurors(...Array.from({ length: 30 }, (_, i) => `J${i}:${(i % 4) + 1}`));
    const plan = planReportAssignment(rs, js, "replace");
    const counts = plan.perJuror.map((p) => p.count);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(plan.unassigned).toBe(0);
  });

  it("uses every problem of a juror with several duos", () => {
    const rs = reports(4, 4);
    const plan = planReportAssignment(rs, jurors("A:1", "B:2", "C:1,2", "D:1,2"), "replace");
    expect(Object.values(loads(rs, plan))).toEqual([2, 2, 2, 2]);
    expect(plan.offSpecialty).toBe(0);
  });

  it("fill keeps the reports placed by hand and balances the rest around them", () => {
    const rs = reports(4, 4).map((r) => (r.id === "P1-0" || r.id === "P1-1" ? { ...r, accountId: "C" } : r));
    const plan = planReportAssignment(rs, jurors("A:1", "B:1", "C:2", "D:2"), "fill");
    const byId = applied(rs, plan);
    expect(byId.get("P1-0")).toBe("C");
    expect(byId.get("P1-1")).toBe("C");
    expect(loads(rs, plan)).toEqual({ A: 2, B: 2, C: 2, D: 2 });
    expect(plan.changes.map((c) => c.reportId)).not.toContain("P1-0");
  });

  it("replace moves everything but the reports already graded", () => {
    const rs = reports(2, 2).map((r) => {
      if (r.id === "P1-0") return { ...r, accountId: "D", locked: true }; // graded off-specialty: stays
      if (r.id === "P2-0") return { ...r, accountId: "A" }; // not graded: may move
      return r;
    });
    const plan = planReportAssignment(rs, jurors("A:1", "B:1", "C:2", "D:2"), "replace");
    const byId = applied(rs, plan);
    expect(byId.get("P1-0")).toBe("D");
    expect(["C", "D"]).toContain(byId.get("P2-0"));
    expect(Object.values(loads(rs, plan)).every((n) => n === 1)).toBe(true);
  });

  it("does nothing in fill mode when every report already has a juror", () => {
    const rs = reports(2).map((r) => ({ ...r, accountId: "A" }));
    const plan = planReportAssignment(rs, jurors("A:1", "B:1"), "fill");
    expect(plan.changes).toEqual([]);
    expect(plan.assigned).toBe(2);
  });

  it("leaves reports without a juror when there is none", () => {
    const rs = reports(3);
    const plan = planReportAssignment(rs, [], "replace");
    expect(plan.assigned).toBe(0);
    expect(plan.unassigned).toBe(3);
    expect(plan.changes).toEqual([]);
  });
});
