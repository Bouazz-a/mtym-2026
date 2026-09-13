import type { Participant, TeamMember } from "@/types";
import { apiFetch, apiFetchOptional } from "@/lib/api/client";
import { getTeamById } from "./teamRepository";

// GET /api/participants only ever returns the caller's own record for a
// participant (never their teammates) — see backend/src/routes/participants.ts.
// This is fine for admin/jury callers (who get the full list), but "my
// team roster" needs to go through the team's included participants
// instead, which every role can read.
export function getParticipants(): Promise<Participant[]> {
  return apiFetch<Participant[]>("/participants");
}

export function getParticipantById(id: string): Promise<Participant | undefined> {
  return apiFetchOptional<Participant>(`/participants/${id}`);
}

export async function getParticipantsByTeam(teamId: string): Promise<TeamMember[]> {
  const team = await getTeamById(teamId);
  return team?.participants ?? [];
}

// Self or admin update — see backend UpdateSchema for the accepted fields.
export function updateParticipant(id: string, patch: Partial<Participant>): Promise<Participant> {
  return apiFetch<Participant>(`/participants/${id}`, { method: "PUT", body: patch });
}

// Admin-only create — requires an existing team.
export function createParticipant(data: Omit<Participant, "id">): Promise<Participant> {
  return apiFetch<Participant>("/participants", { method: "POST", body: data });
}

export function deleteParticipant(id: string): Promise<void> {
  return apiFetch<void>(`/participants/${id}`, { method: "DELETE" });
}
