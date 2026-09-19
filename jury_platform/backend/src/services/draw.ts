import { BadRequestError } from "../utils/errors";
import { teamsOf, type Lineup } from "./passages";

export interface DrawPassage extends Lineup {
  label: string;
  problemNumber: number;
  slot: number; // 1..n — the day's time slot
}

export interface DrawPool {
  label: string;
  passages: DrawPassage[];
}

// Checks a pool draw computed by the admin UI against the qualifs rules
// before it replaces the day's pools. Throws on the first broken rule.
//   - every team of the day is in exactly one pool, and no other team is
//   - a pool has 3 or 4 teams and one passage per team
//   - each team defends exactly once in its pool, on a different problem
//   - a team never holds two roles in the same passage
//   - the observer ("extra") role exists only in pools of 4
//   - a pool's passages take slots 1..n, one each
export function validateDraw(pools: DrawPool[], dayTeamIds: string[]): void {
  const dayTeams = new Set(dayTeamIds);
  const placed = new Set<string>();
  const labels = new Set<string>();

  for (const pool of pools) {
    if (labels.has(pool.label)) fail(`Libellé de poule en double : ${pool.label}`);
    labels.add(pool.label);

    const members = new Set(pool.passages.flatMap(teamsOf));
    const size = pool.passages.length;
    if ((size !== 3 && size !== 4) || members.size !== size) {
      fail(`Poule ${pool.label} : il faut 3 ou 4 équipes et un passage par équipe`);
    }

    for (const p of pool.passages) {
      const teams = teamsOf(p);
      if (new Set(teams).size !== teams.length) fail(`${p.label} : une équipe a deux rôles`);
      if ((size === 4) !== Boolean(p.extraTeamId)) {
        fail(`${p.label} : l'observateur n'existe que dans les poules de 4`);
      }
    }
    if (new Set(pool.passages.map((p) => p.defenderTeamId)).size !== size) {
      fail(`Poule ${pool.label} : chaque équipe doit défendre une fois`);
    }
    if (new Set(pool.passages.map((p) => p.problemNumber)).size !== size) {
      fail(`Poule ${pool.label} : un problème est défendu deux fois`);
    }
    const slots = new Set(pool.passages.map((p) => p.slot));
    if (slots.size !== size || [...slots].some((n) => n < 1 || n > size)) {
      fail(`Poule ${pool.label} : les passages doivent occuper les créneaux 1 à ${size}`);
    }

    for (const teamId of members) {
      if (!dayTeams.has(teamId)) fail(`Poule ${pool.label} : une équipe n'est pas inscrite ce jour-là`);
      if (placed.has(teamId)) fail("Une équipe apparaît dans deux poules");
      placed.add(teamId);
    }
  }

  const missing = dayTeams.size - placed.size;
  if (missing > 0) fail(`${missing} équipe(s) de ce jour ne sont dans aucune poule`);
}

function fail(message: string): never {
  throw new BadRequestError(message);
}
