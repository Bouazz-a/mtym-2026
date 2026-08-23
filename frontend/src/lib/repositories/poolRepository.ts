import type { Passage, PassageRole, Pool, Round } from "@/types";
import { getAll, setAll } from "../storage";

export function getPools(): Pool[] {
  return getAll("pools") as Pool[];
}

export function getPoolsByRound(round: Round): Pool[] {
  return getPools().filter(p => p.round === round);
}

export function upsertPool(pool: Pool): void {
  const all = getPools();
  const idx = all.findIndex(p => p.id === pool.id);
  if (idx === -1) {
    setAll("pools", [...all, pool]);
  } else {
    const updated = [...all];
    updated[idx] = pool;
    setAll("pools", updated);
  }
}

export function deletePool(id: string): void {
  setAll("pools", getPools().filter(p => p.id !== id));
}

export function getPassages(): Passage[] {
  return getAll("passages") as Passage[];
}

export function getPassageById(id: string): Passage | undefined {
  return getPassages().find(p => p.id === id);
}

export function getPassagesByPool(poolId: string): Passage[] {
  return getPassages().filter(p => p.poolId === poolId);
}

export function getPassagesByTeam(teamId: string): Passage[] {
  return getPassages().filter(p =>
    p.defenderTeamId === teamId ||
    p.opponentTeamId === teamId ||
    p.reporterTeamId === teamId ||
    p.extraTeamId    === teamId
  );
}

export function getTeamRoleInPassage(teamId: string, passage: Passage): PassageRole | null {
  if (passage.defenderTeamId === teamId) return "defender";
  if (passage.opponentTeamId === teamId) return "opponent";
  if (passage.reporterTeamId === teamId) return "reporter";
  if (passage.extraTeamId    === teamId) return "extra";
  return null;
}

export function upsertPassage(passage: Passage): void {
  const all = getPassages();
  const idx = all.findIndex(p => p.id === passage.id);
  if (idx === -1) {
    setAll("passages", [...all, passage]);
  } else {
    const updated = [...all];
    updated[idx] = passage;
    setAll("passages", updated);
  }
}

export function deletePassage(id: string): void {
  setAll("passages", getPassages().filter(p => p.id !== id));
}