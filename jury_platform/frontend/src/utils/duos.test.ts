import type { JuryDuo } from "@/types";
import { jurorSpecialties, specialtiesAgree } from "./duos";

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

  it("lets two jurors of the same specialty, or without one, form a duo", () => {
    const of = (id: string) => jurorSpecialties(duos, id);
    expect(specialtiesAgree([of("j1"), of("j4")], null)).toBe(true); // both P1, other centers
    expect(specialtiesAgree([of("j1"), of("j3")], null)).toBe(false); // P1 and P2
    expect(specialtiesAgree([of("j1"), of("j7")], null)).toBe(true); // j7 has none yet
    expect(specialtiesAgree([of("j1"), of("j7")], 3)).toBe(false); // j1 can't take P3
  });
});
