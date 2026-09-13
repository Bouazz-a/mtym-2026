import type { Workshop, WorkshopAssignment, WorkshopPreference } from "@/types";
import { apiFetch } from "@/lib/api/client";

// ─── Workshops ─────────────────────────────────────────────────────────

export function getWorkshops(): Promise<Workshop[]> {
  return apiFetch<Workshop[]>("/workshops");
}

// Admin/logistics-only (see backend/src/routes/workshops.ts).
export function createWorkshop(data: Omit<Workshop, "id">): Promise<Workshop> {
  return apiFetch<Workshop>("/workshops", { method: "POST", body: data });
}

export function updateWorkshop(id: string, patch: Partial<Omit<Workshop, "id">>): Promise<Workshop> {
  return apiFetch<Workshop>(`/workshops/${id}`, { method: "PUT", body: patch });
}

export function deleteWorkshop(id: string): Promise<void> {
  return apiFetch<void>(`/workshops/${id}`, { method: "DELETE" });
}

// ─── Preferences ───────────────────────────────────────────────────────
// GET /workshop-preferences returns a different shape depending on the
// caller: a participant gets back just their own preference (or null); an
// organizer/jury caller gets the full list. Split into two functions so
// each call site gets the type it actually expects.

export function getMyWorkshopPreference(): Promise<WorkshopPreference | null> {
  return apiFetch<WorkshopPreference | null>("/workshop-preferences");
}

export function getWorkshopPreferences(): Promise<WorkshopPreference[]> {
  return apiFetch<WorkshopPreference[]>("/workshop-preferences");
}

// Participant sets their own three choices; an admin/logistics organizer
// can set them on a participant's behalf via participantId.
export function saveWorkshopPreference(data: {
  choice1Id: string;
  choice2Id: string;
  choice3Id: string;
  participantId?: string;
}): Promise<WorkshopPreference> {
  return apiFetch<WorkshopPreference>("/workshop-preferences", { method: "PUT", body: data });
}

// ─── Assignments ───────────────────────────────────────────────────────
// Same role-shaped response as preferences above.

export function getMyWorkshopAssignment(): Promise<WorkshopAssignment | null> {
  return apiFetch<WorkshopAssignment | null>("/workshop-assignments");
}

export function getWorkshopAssignments(): Promise<WorkshopAssignment[]> {
  return apiFetch<WorkshopAssignment[]>("/workshop-assignments");
}

// Admin/logistics-only — wipes and recomputes every assignment in one
// greedy pass over declared preferences (see backend/src/routes/
// workshop-assignments.ts).
export function runAutoWorkshopAssignment(): Promise<WorkshopAssignment[]> {
  return apiFetch<WorkshopAssignment[]>("/workshop-assignments/auto", { method: "POST" });
}
