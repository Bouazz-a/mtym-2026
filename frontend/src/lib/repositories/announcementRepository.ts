import type { Announcement, Deadline } from "@/types";
import { apiFetch } from "@/lib/api/client";

// The backend already filters both lists by the caller's role/audience —
// no client-side audience filtering needed on the read side.

export function getAnnouncements(): Promise<Announcement[]> {
  return apiFetch<Announcement[]>("/announcements");
}

// Admin-only.
export function createAnnouncement(
  data: Pick<Announcement, "title" | "body" | "audience" | "attachments">,
): Promise<Announcement> {
  return apiFetch<Announcement>("/announcements", { method: "POST", body: data });
}

export function updateAnnouncement(
  id: string,
  patch: Partial<Pick<Announcement, "title" | "body" | "audience" | "attachments">>,
): Promise<Announcement> {
  return apiFetch<Announcement>(`/announcements/${id}`, { method: "PUT", body: patch });
}

export function deleteAnnouncement(id: string): Promise<void> {
  return apiFetch<void>(`/announcements/${id}`, { method: "DELETE" });
}

export function getDeadlines(): Promise<Deadline[]> {
  return apiFetch<Deadline[]>("/deadlines");
}

// Any organizer role.
export function createDeadline(
  data: Pick<Deadline, "label" | "date" | "targetRole">,
): Promise<Deadline> {
  return apiFetch<Deadline>("/deadlines", { method: "POST", body: data });
}

export function updateDeadline(
  id: string,
  patch: Partial<Pick<Deadline, "label" | "date" | "targetRole">>,
): Promise<Deadline> {
  return apiFetch<Deadline>(`/deadlines/${id}`, { method: "PUT", body: patch });
}

export function deleteDeadline(id: string): Promise<void> {
  return apiFetch<void>(`/deadlines/${id}`, { method: "DELETE" });
}
