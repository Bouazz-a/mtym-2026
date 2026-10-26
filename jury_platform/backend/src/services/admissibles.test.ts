import { describe, expect, it } from "vitest";
import { sortOutReports } from "./admissibles";

const handed = (reportId: string, teamId: string, problemNumber: number, accountId: string) => ({ reportId, teamId, problemNumber, accountId });

describe("reports of the teams outside the admissibles", () => {
  const reports = [
    handed("r1", "A", 2, "ana"), // A is admissible: untouched
    handed("r2", "B", 2, "ana"), // B is not, Ana hasn't graded it: goes back
    handed("r3", "B", 3, "bob"), // graded by Bob, who holds it: stays
    handed("r4", "C", 1, "cy"), // graded, but by someone else than Cy: goes back
  ];
  const graded = [
    { juryId: "bob", teamId: "B", problemNumber: 3 },
    { juryId: "dan", teamId: "C", problemNumber: 1 },
    { juryId: "ana", teamId: "A", problemNumber: 2 },
  ];

  it("takes back what isn't graded, keeps what is, leaves the admissibles alone", () => {
    const { takeBack, keep } = sortOutReports(reports, graded, new Set(["A"]));
    expect(takeBack.map((r) => r.reportId)).toEqual(["r2", "r4"]);
    expect(keep.map((r) => r.reportId)).toEqual(["r3"]);
  });

  it("touches nothing when every team is admissible", () => {
    expect(sortOutReports(reports, graded, new Set(["A", "B", "C"]))).toEqual({ takeBack: [], keep: [] });
  });
});
