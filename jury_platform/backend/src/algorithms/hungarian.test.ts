import { describe, expect, it } from "vitest";
import { minCostAssignment } from "./hungarian";

const total = (cost: number[][], assign: number[]) => assign.reduce((s, col, row) => s + cost[row][col], 0);

describe("minCostAssignment", () => {
  it("finds the optimum of a square matrix", () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    const assign = minCostAssignment(cost);
    expect(new Set(assign).size).toBe(3); // a permutation
    expect(total(cost, assign)).toBe(5); // 1 + 2 + 2
  });

  it("uses extra columns when rows are fewer", () => {
    const cost = [
      [5, 1, 9],
      [1, 5, 9],
    ];
    expect(minCostAssignment(cost)).toEqual([1, 0]);
  });

  it("returns nothing for an empty matrix", () => {
    expect(minCostAssignment([])).toEqual([]);
  });
});
