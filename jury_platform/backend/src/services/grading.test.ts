import { describe, expect, it } from "vitest";
import { frNumber, noteDetails, noteOf } from "./grading";

const GRID = [
  { id: "a", label: "Rigueur", coefficient: 10 },
  { id: "b", label: "Clarté", coefficient: 6 },
  { id: "m", label: "Dépassement du temps", coefficient: -2 },
];

describe("a juror's note, for the journal", () => {
  it("adds up score x coefficient, out of the positive coefficients", () => {
    expect(noteOf([{ criterionId: "a", score: 0.5 }, { criterionId: "b", score: 1 }], GRID)).toEqual({ total: 11, max: 16 });
    // A malus takes points off, and a grade of another grid counts for nothing
    expect(noteOf([{ criterionId: "a", score: 1 }, { criterionId: "m", score: 1 }, { criterionId: "x", score: 1 }], GRID)).toEqual({ total: 8, max: 16 });
    expect(noteOf([], GRID)).toEqual({ total: 0, max: 16 });
  });

  it("brings a written report's note back to 20", () => {
    expect(noteOf([{ criterionId: "a", score: 1 }, { criterionId: "b", score: 1 }], GRID, 20)).toEqual({ total: 20, max: 20 });
    expect(noteOf([{ criterionId: "a", score: 0.5 }], GRID, 20)).toEqual({ total: 6.25, max: 20 });
    expect(noteOf([{ criterionId: "a", score: 1 }], [], 20)).toEqual({ total: 0, max: 0 }); // no grid: nothing to scale
  });

  it("writes numbers the French way", () => {
    expect(frNumber(12.5)).toBe("12,5");
    expect(frNumber(6.256)).toBe("6,26");
    expect(frNumber(7)).toBe("7");
  });

  it("keeps the whole note, criterion by criterion", () => {
    const details = noteDetails(
      { globalRemark: "Bon exposé", grades: [{ criterionId: "a", score: 0.75, remark: "une erreur" }, { criterionId: "b", score: 1, remark: null }] },
      GRID,
    );
    expect(details).toEqual({
      note: "13,5 sur 16",
      remarque: "Bon exposé",
      critères: [
        { critère: "Rigueur", taux: 0.75, remarque: "une erreur" },
        { critère: "Clarté", taux: 1 },
        { critère: "Dépassement du temps", taux: null },
      ],
    });
  });
});
