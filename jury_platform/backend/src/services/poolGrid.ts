import { BadRequestError } from "../utils/errors";
import { validatePool, type DrawPool } from "./draw";

// A pool composed by hand. While cells are still empty the grid lives in
// Pool.draft as JSON; the passages themselves are only created once it is
// complete, so nothing else in the platform ever meets a passage missing a
// team (jurors, grading, notes, results all assume three teams).

export interface GridPassage {
  slot: number;
  problemNumber: number;
  defenderTeamId: string | null;
  opponentTeamId: string | null;
  reporterTeamId: string | null;
  extraTeamId: string | null;
  room: string | null;
}

export interface PoolGrid {
  size: 3 | 4;
  passages: GridPassage[];
}

const ROLES = ["defenderTeamId", "opponentTeamId", "reporterTeamId", "extraTeamId"] as const;

export function emptyGrid(size: 3 | 4): PoolGrid {
  return {
    size,
    passages: Array.from({ length: size }, (_, i) => ({
      slot: i + 1,
      problemNumber: i + 1,
      defenderTeamId: null,
      opponentTeamId: null,
      reporterTeamId: null,
      extraTeamId: null,
      room: null,
    })),
  };
}

export function teamsInGrid(grid: PoolGrid): string[] {
  return [...new Set(grid.passages.flatMap((p) => ROLES.map((r) => p[r]).filter((id): id is string => id !== null)))];
}

// Every cell filled: the three roles everywhere, plus the observer in a pool
// of 4 (where one team sits out each passage).
export function isComplete(grid: PoolGrid): boolean {
  return grid.passages.length === grid.size && grid.passages.every((p) =>
    p.defenderTeamId !== null &&
    p.opponentTeamId !== null &&
    p.reporterTeamId !== null &&
    (grid.size === 3 || p.extraTeamId !== null));
}

// What must hold even with holes: the shape of the grid, no team twice in one
// passage, and teams that belong to this day and to no other pool.
export function validateGrid(
  label: string,
  grid: PoolGrid,
  dayTeams: Set<string>,
  takenElsewhere: Set<string>,
): void {
  if (grid.size !== 3 && grid.size !== 4) fail("Une poule compte 3 ou 4 équipes");
  if (grid.passages.length !== grid.size) fail(`Poule ${label} : ${grid.size} équipes, donc ${grid.size} passages`);

  const slots = new Set(grid.passages.map((p) => p.slot));
  if (slots.size !== grid.size || [...slots].some((n) => n < 1 || n > grid.size)) {
    fail(`Poule ${label} : les passages doivent occuper les créneaux 1 à ${grid.size}`);
  }
  for (const p of grid.passages) {
    if (p.problemNumber < 1 || p.problemNumber > 4) fail(`Poule ${label} : problème ${p.problemNumber} inconnu`);
    if (grid.size === 3 && p.extraTeamId !== null) {
      fail(`Poule ${label} : l'observateur n'existe que dans les poules de 4`);
    }
    const teams = ROLES.map((r) => p[r]).filter((id): id is string => id !== null);
    if (new Set(teams).size !== teams.length) fail(`Poule ${label}, passage ${p.slot} : une équipe a deux rôles`);
  }
  for (const teamId of teamsInGrid(grid)) {
    if (!dayTeams.has(teamId)) fail(`Poule ${label} : une équipe n'est pas inscrite ce jour-là`);
    if (takenElsewhere.has(teamId)) fail(`Poule ${label} : une équipe est déjà dans une autre poule`);
  }

  // A finished grid must also obey the qualifs rules (each team defends once,
  // one problem each…) before it becomes real passages.
  if (isComplete(grid)) validatePool(toDrawPool(label, grid), dayTeams, takenElsewhere);
}

// The finished grid as the draw's own shape, for validatePool.
export function toDrawPool(label: string, grid: PoolGrid): DrawPool {
  return {
    label,
    passages: grid.passages.map((p) => ({
      label: `${label}P${p.slot}`,
      problemNumber: p.problemNumber,
      defenderTeamId: p.defenderTeamId!,
      opponentTeamId: p.opponentTeamId!,
      reporterTeamId: p.reporterTeamId!,
      extraTeamId: p.extraTeamId,
      slot: p.slot,
    })),
  };
}

function fail(message: string): never {
  throw new BadRequestError(message);
}
