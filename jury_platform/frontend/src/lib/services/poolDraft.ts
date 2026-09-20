import type { GridPassage, PoolDetails, PoolGrid } from "@/types";

// A pool composed by hand: the grid the admin fills cell by cell, what is
// still missing, and the rules broken so far. The server checks the same
// rules again before saving (services/poolGrid.ts); this drives the
// buttons and the messages while editing.
//
// A pool of 3: three passages, each team defends once (roles DEF/OPP/RAP).
// A pool of 4: four passages, the fourth team sits out as observer (OBS).

export const ROLES = ["defenderTeamId", "opponentTeamId", "reporterTeamId", "extraTeamId"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  defenderTeamId: "Défenseur",
  opponentTeamId: "Opposant",
  reporterTeamId: "Rapporteur",
  extraTeamId: "Observateur",
};

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

// The grid of an existing pool, to reopen it for editing.
export function gridOf(pool: PoolDetails): PoolGrid {
  if (pool.draft) return pool.draft;
  const size = pool.passages.length === 3 ? 3 : 4;
  return {
    size,
    passages: [...pool.passages]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({
        slot: p.slot,
        problemNumber: p.problemNumber,
        defenderTeamId: p.defenderTeamId,
        opponentTeamId: p.opponentTeamId,
        reporterTeamId: p.reporterTeamId,
        extraTeamId: p.extraTeamId ?? null,
        room: p.room ?? null,
      })),
  };
}

export function setCell(grid: PoolGrid, slot: number, role: Role, teamId: string | null): PoolGrid {
  return {
    ...grid,
    passages: grid.passages.map((p) => (p.slot === slot ? { ...p, [role]: teamId } : p)),
  };
}

export function setPassage<K extends keyof GridPassage>(grid: PoolGrid, slot: number, key: K, value: GridPassage[K]): PoolGrid {
  return {
    ...grid,
    passages: grid.passages.map((p) => (p.slot === slot ? { ...p, [key]: value } : p)),
  };
}

export function teamsOf(passage: GridPassage): string[] {
  return ROLES.map((r) => passage[r]).filter((id): id is string => id !== null);
}

export function teamsInGrid(grid: PoolGrid): string[] {
  return [...new Set(grid.passages.flatMap(teamsOf))];
}

// Cells still to fill (the observer counts only in a pool of 4)
export function missingCells(grid: PoolGrid): number {
  const perPassage = grid.size === 4 ? 4 : 3;
  return grid.passages.reduce(
    (n, p) => n + perPassage - ROLES.slice(0, perPassage).filter((r) => p[r] !== null).length,
    0,
  );
}

export const isComplete = (grid: PoolGrid): boolean => missingCells(grid) === 0;

// Everything that would make the server refuse the grid, in French, ready
// to show. An empty list means "saveable" — as a draft while cells are
// missing, as real passages once complete.
export function gridProblems(grid: PoolGrid, takenElsewhere: Map<string, string>): string[] {
  const problems: string[] = [];

  for (const p of grid.passages) {
    const teams = teamsOf(p);
    if (new Set(teams).size !== teams.length) {
      problems.push(`Passage ${p.slot} : une équipe y a deux rôles.`);
    }
    for (const teamId of teams) {
      const pool = takenElsewhere.get(teamId);
      if (pool) problems.push(`Passage ${p.slot} : une équipe est déjà dans la poule ${pool}.`);
    }
  }

  if (isComplete(grid)) {
    const defenders = grid.passages.map((p) => p.defenderTeamId);
    if (new Set(defenders).size !== grid.size) {
      problems.push("Chaque équipe doit défendre une fois et une seule.");
    }
    if (new Set(teamsInGrid(grid)).size !== grid.size) {
      problems.push(`Une poule de ${grid.size} doit compter exactement ${grid.size} équipes.`);
    }
    if (new Set(grid.passages.map((p) => p.problemNumber)).size !== grid.size) {
      problems.push("Deux passages défendent le même problème.");
    }
  }

  return [...new Set(problems)];
}

// Fills the grid from the teams already placed, following the tournament's
// rotation: passage n is defended by team n, opposed by the next one, and
// so on (Guide du Jury §4.1). Cells whose team isn't known yet stay empty.
export function fillRotation(grid: PoolGrid, teams: (string | null)[]): PoolGrid {
  const members = teams.slice(0, grid.size);
  return {
    ...grid,
    passages: grid.passages.map((p, i) => ({
      ...p,
      defenderTeamId: members[i] ?? null,
      opponentTeamId: members[(i + 1) % grid.size] ?? null,
      reporterTeamId: members[(i + 2) % grid.size] ?? null,
      extraTeamId: grid.size === 4 ? members[(i + 3) % grid.size] ?? null : null,
    })),
  };
}

// The pool's teams in rotation order (the defender of each passage), used
// to prefill the rotation from what's already there.
export function rotationTeams(grid: PoolGrid): (string | null)[] {
  return grid.passages.map((p) => p.defenderTeamId);
}
