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

// Checks a pool draw (from algorithms/poolDraw.ts) against the qualifs
// rules before it is saved — a guard against a bug in the draw, since the
// same rules also apply to a pool composed by hand. Throws on the first
// broken rule.
//   - a team belongs to at most one pool, and is a team of that day
//   - a pool has 3 or 4 teams and one passage per team
//   - each team defends exactly once in its pool, on a different problem
//   - a team never holds two roles in the same passage
//   - the observer ("extra") role exists only in pools of 4
//   - a pool's passages take slots 1..n, one each
//
// Teams left without a pool are allowed and counted, not refused: when a
// team doesn't come, its pool mates are moved to the online tournament by
// hand, and the day still has to be saved and validated.
export function validateDraw(pools: DrawPool[], dayTeamIds: string[]): { leftOut: number } {
  const dayTeams = new Set(dayTeamIds);
  const placed = new Set<string>();
  const labels = new Set<string>();

  for (const pool of pools) {
    if (labels.has(pool.label)) fail(`Libellé de poule en double : ${pool.label}`);
    labels.add(pool.label);
    validatePool(pool, dayTeams, placed);
    for (const teamId of new Set(pool.passages.flatMap(teamsOf))) placed.add(teamId);
  }

  return { leftOut: dayTeams.size - placed.size };
}

// The rules of a single finished pool — also used when one pool is composed
// by hand (pools.ts), where the other pools' teams are the ones "taken".
export function validatePool(pool: DrawPool, dayTeams: Set<string>, takenElsewhere: Set<string>): void {
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
    if (takenElsewhere.has(teamId)) fail("Une équipe apparaît dans deux poules");
  }
}

function fail(message: string): never {
  throw new BadRequestError(message);
}
