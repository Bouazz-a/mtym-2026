import type { JuryDuo } from "@/types";
import { jurorSpecialties } from "./duos";

const juror = (id: string) => ({ id, firstName: id, lastName: id, email: `${id}@t` });
const duo = (id: string, problemNumber: number | null, ...members: string[]): JuryDuo =>
  ({ id, centerDayId: "day", number: 1, problemNumber, members: members.map(juror) });

describe("specialties", () => {
  // CAS day 1: j1 + j2 on P1, j3 + j5 on P2; Rabat: j4 + j6 on P1
  const duos = [duo("d1", 1, "j1", "j2"), duo("d2", 2, "j3", "j5"), duo("d3", 1, "j4", "j6"), duo("d4", null, "j7", "j8")];

  it("reads a juror's specialty from their duos, leaving one out on demand", () => {
    expect(jurorSpecialties(duos, "j1")).toEqual([1]);
    expect(jurorSpecialties(duos, "j1", "d1")).toEqual([]);
    expect(jurorSpecialties(duos, "j7")).toEqual([]); // a duo without a problem gives none
  });

  it("gathers every problem of a juror's duos, each once", () => {
    // Weekend 2: j1 (P1 so far) and j3 (P2) together on P3, in a trio
    const later = [...duos, duo("d5", 3, "j1", "j3", "j7"), duo("d6", 1, "j1", "j9")];
    expect(jurorSpecialties(later, "j1")).toEqual([1, 3]);
    expect(jurorSpecialties(later, "j3")).toEqual([2, 3]);
    expect(jurorSpecialties(later, "j7")).toEqual([3]);
  });
});
