import type { JuryAssignment, JuryMember, JuryPassageAssignment } from "@/types";
import { apiFetch, apiFetchOptional } from "@/lib/api/client";

// The old localStorage version also exposed composite helpers like
// getTeamsAssignedToJuror() / getPassagesAssignedToJuror() that joined
// assignments against the team/passage lists internally. Those relied on
// everything being loaded synchronously in memory, which no longer holds
// once every read is a network call. Pages now fetch the assignment list
// and the team/passage list as two separate queries and join them locally
// (see JuryDashboard.tsx, JuryPassagesPage.tsx, etc.) — same as the
// pattern already used for teams+documents in the participant pages.

export function getJuryMembers(): Promise<JuryMember[]> {
  return apiFetch<JuryMember[]>("/jury");
}

export function getJuryMemberById(id: string): Promise<JuryMember | undefined> {
  return apiFetchOptional<JuryMember>(`/jury/${id}`);
}

export function getJuryAssignments(): Promise<JuryAssignment[]> {
  return apiFetch<JuryAssignment[]>("/jury-assignments");
}

export function getJuryPassageAssignments(): Promise<JuryPassageAssignment[]> {
  return apiFetch<JuryPassageAssignment[]>("/jury-passage-assignments");
}

// Per-juror workload summary — the backend computes this directly
// (see GET /api/jury/loads) instead of the frontend re-deriving it from
// the raw assignment lists.
export interface JurorLoad {
  juror: JuryMember;
  interTeams: number;
  finalTeams: number;
  passages: number;
}

export function getJurorLoads(): Promise<JurorLoad[]> {
  return apiFetch<JurorLoad[]>("/jury/loads");
}

// ─── Admin-only bulk writes ────────────────────────────────────────────
// Both endpoints wipe and rewrite the whole table in one transaction (see
// backend/src/routes/jury-assignments.ts and jury-passage-assignments.ts)
// — there's no per-row create/delete, only a full replace. That matches
// how the organizer's assignment tools already work: recompute the whole
// mapping, then save it in one shot.

export function saveJuryAssignments(assignments: JuryAssignment[]): Promise<void> {
  return apiFetch<void>("/jury-assignments/save", { method: "POST", body: assignments });
}

export function saveJuryPassageAssignments(assignments: JuryPassageAssignment[]): Promise<void> {
  return apiFetch<void>("/jury-passage-assignments/save", { method: "POST", body: assignments });
}
