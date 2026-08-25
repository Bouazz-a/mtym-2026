import type { Organizer, OrganizerRole } from "@/types";
import { apiFetch, apiFetchOptional } from "@/lib/api/client";

// Every route here is admin-only (see backend/src/routes/organizers.ts) —
// managing organizer accounts is restricted to the "admin" organizer role.

export function getOrganizers(): Promise<Organizer[]> {
  return apiFetch<Organizer[]>("/organizers");
}

export function getOrganizerById(id: string): Promise<Organizer | undefined> {
  return apiFetchOptional<Organizer>(`/organizers/${id}`);
}

// No server-side filter for this — fetch and filter client-side.
export async function getOrganizersByRole(role: OrganizerRole): Promise<Organizer[]> {
  const all = await getOrganizers();
  return all.filter(o => o.role === role);
}

export function createOrganizer(
  data: Pick<Organizer, "firstName" | "lastName" | "email" | "phone" | "role">,
): Promise<Organizer> {
  return apiFetch<Organizer>("/organizers", { method: "POST", body: data });
}

export function updateOrganizer(
  id: string,
  patch: Partial<Pick<Organizer, "firstName" | "lastName" | "email" | "phone" | "role">>,
): Promise<Organizer> {
  return apiFetch<Organizer>(`/organizers/${id}`, { method: "PUT", body: patch });
}

export function deleteOrganizer(id: string): Promise<void> {
  return apiFetch<void>(`/organizers/${id}`, { method: "DELETE" });
}
