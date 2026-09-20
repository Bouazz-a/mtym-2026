import { describe, expect, it } from "vitest";
import {
  emptyGrid,
  fillRotation,
  gridProblems,
  isComplete,
  missingCells,
  setCell,
  teamsInGrid,
} from "./poolDraft";

const none = new Map<string, string>();

describe("poolDraft", () => {
  it("opens a pool of 3 with three empty passages", () => {
    const grid = emptyGrid(3);
    expect(grid.passages.map((p) => p.slot)).toEqual([1, 2, 3]);
    expect(grid.passages.map((p) => p.problemNumber)).toEqual([1, 2, 3]);
    expect(missingCells(grid)).toBe(9); // 3 roles × 3 passages
    expect(isComplete(grid)).toBe(false);
  });

  it("counts the observer only in a pool of 4", () => {
    expect(missingCells(emptyGrid(4))).toBe(16); // 4 roles × 4 passages
  });

  it("fills a cell and counts down what is left", () => {
    const grid = setCell(emptyGrid(3), 1, "defenderTeamId", "alfa");
    expect(grid.passages[0].defenderTeamId).toBe("alfa");
    expect(missingCells(grid)).toBe(8);
    expect(teamsInGrid(grid)).toEqual(["alfa"]);
  });

  it("empties a cell again", () => {
    let grid = setCell(emptyGrid(3), 2, "opponentTeamId", "beta");
    grid = setCell(grid, 2, "opponentTeamId", null);
    expect(missingCells(grid)).toBe(9);
    expect(teamsInGrid(grid)).toEqual([]);
  });

  it("flags a team holding two roles in the same passage", () => {
    let grid = setCell(emptyGrid(3), 1, "defenderTeamId", "alfa");
    grid = setCell(grid, 1, "opponentTeamId", "alfa");
    expect(gridProblems(grid, none)).toEqual(["Passage 1 : une équipe y a deux rôles."]);
  });

  it("flags a team already placed in another pool", () => {
    const grid = setCell(emptyGrid(3), 1, "defenderTeamId", "alfa");
    expect(gridProblems(grid, new Map([["alfa", "CAS-A2"]]))).toEqual([
      "Passage 1 : une équipe est déjà dans la poule CAS-A2.",
    ]);
  });

  it("says nothing about an incomplete but sane grid", () => {
    const grid = setCell(emptyGrid(4), 1, "defenderTeamId", "alfa");
    expect(gridProblems(grid, none)).toEqual([]);
    expect(isComplete(grid)).toBe(false);
  });

  it("accepts a complete pool built from the rotation", () => {
    const grid = fillRotation(emptyGrid(4), ["alfa", "beta", "gama", "delt"]);
    expect(isComplete(grid)).toBe(true);
    expect(gridProblems(grid, none)).toEqual([]);
    expect(grid.passages[0]).toMatchObject({
      defenderTeamId: "alfa",
      opponentTeamId: "beta",
      reporterTeamId: "gama",
      extraTeamId: "delt",
    });
    expect(grid.passages[3]).toMatchObject({
      defenderTeamId: "delt",
      opponentTeamId: "alfa",
      reporterTeamId: "beta",
      extraTeamId: "gama",
    });
  });

  it("leaves the observer empty in a pool of 3", () => {
    const grid = fillRotation(emptyGrid(3), ["alfa", "beta", "gama"]);
    expect(grid.passages.every((p) => p.extraTeamId === null)).toBe(true);
    expect(isComplete(grid)).toBe(true);
  });

  it("refuses a complete pool where a team never defends", () => {
    let grid = fillRotation(emptyGrid(3), ["alfa", "beta", "gama"]);
    grid = setCell(grid, 3, "defenderTeamId", "alfa"); // gama no longer defends
    expect(gridProblems(grid, none)).toContain("Chaque équipe doit défendre une fois et une seule.");
  });

  it("refuses a complete pool defending the same problem twice", () => {
    const rotated = fillRotation(emptyGrid(3), ["alfa", "beta", "gama"]);
    const grid = { ...rotated, passages: rotated.passages.map((p) => ({ ...p, problemNumber: 2 })) };
    expect(gridProblems(grid, none)).toContain("Deux passages défendent le même problème.");
  });

  it("only fills what it knows when teams are missing", () => {
    const grid = fillRotation(emptyGrid(4), ["alfa", null, "gama", null]);
    expect(grid.passages[0].defenderTeamId).toBe("alfa");
    expect(grid.passages[0].opponentTeamId).toBeNull();
    expect(isComplete(grid)).toBe(false);
    expect(gridProblems(grid, none)).toEqual([]);
  });
});
