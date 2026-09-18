import type { Center, Team } from "@/types";
import { apiFetch } from "@/lib/api/client";

// Teams are imported from the main site's dump (scripts/import-dump.sh),
// never created here. Admins see every team, jurors the teams of their pools.

export function getTeams(filter: { center?: Center; centerDayId?: string } = {}): Promise<Team[]> {
  return apiFetch<Team[]>("/teams", { params: filter });
}

// The one day a team plays; refused once the team is in a drawn pool.
export function setTeamDay(teamId: string, centerDayId: string | null): Promise<Team> {
  return apiFetch<Team>(`/teams/${teamId}/day`, { method: "PUT", body: { centerDayId } });
}
