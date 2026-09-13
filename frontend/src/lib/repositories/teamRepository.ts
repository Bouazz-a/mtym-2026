import type { Team } from "@/types";
import { apiFetch, apiFetchOptional } from "@/lib/api/client";

export function getTeams(): Promise<Team[]> {
  return apiFetch<Team[]>("/teams");
}

export function getTeamById(id: string): Promise<Team | undefined> {
  return apiFetchOptional<Team>(`/teams/${id}`);
}

export async function getTeamByQuadrigramme(q: string): Promise<Team | undefined> {
  const teams = await getTeams();
  return teams.find(t => t.quadrigramme === q);
}

// Participant creates their own team — the server assigns id/creatorId
// from the caller's identity, so only name/quadrigramme are accepted.
export function createTeam(data: { name: string; quadrigramme: string }): Promise<Team> {
  return apiFetch<Team>("/teams", { method: "POST", body: data });
}

// Admin-only partial update. Note: poolIdRound1/poolIdRound2 are NOT
// settable here — they're only ever written as a side effect of the bulk
// round-generation endpoint (see lib/services/tournamentOptimizer.ts).
export function updateTeam(
  id: string,
  patch: Partial<Pick<Team, "name" | "quadrigramme" | "creatorId">>,
): Promise<Team> {
  return apiFetch<Team>(`/teams/${id}`, { method: "PUT", body: patch });
}

// Admin moves a participant to a different team.
export function moveParticipantToTeam(teamId: string, participantId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/teams/${teamId}/move-participant`, {
    method: "PUT",
    body: { participantId },
  });
}

export function deleteTeam(id: string): Promise<void> {
  return apiFetch<void>(`/teams/${id}`, { method: "DELETE" });
}
