import type { Team } from "@/types";
import { getAll, setAll } from "../storage";

export function getTeams(): Team[] {
  return getAll("teams") as Team[];
}

export function getTeamById(id: string): Team | undefined {
  return getTeams().find(t => t.id === id);
}

export function getTeamByQuadrigramme(q: string): Team | undefined {
  return getTeams().find(t => t.quadrigramme === q);
}

export function upsertTeam(team: Team): void {
  const all = getTeams();
  const idx = all.findIndex(t => t.id === team.id);
  if (idx === -1) {
    setAll("teams", [...all, team]);
  } else {
    const updated = [...all];
    updated[idx] = team;
    setAll("teams", updated);
  }
}

export function deleteTeam(id: string): void {
  setAll("teams", getTeams().filter(t => t.id !== id));
}