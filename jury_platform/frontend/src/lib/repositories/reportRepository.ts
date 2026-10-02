import { apiFetch } from "@/lib/api/client";

// A short-lived (10 min) signed link to a report PDF in the main site's
// bucket. Fetched when opening, never stored.
export function getReportUrl(reportId: string): Promise<{ url: string; expiresIn: number }> {
  return apiFetch(`/reports/${reportId}/url`);
}

// The same, for the presentation a team shows when it defends: only for the
// duo judging that passage (and the admins).
export function getPresentationUrl(presentationId: string): Promise<{ url: string; expiresIn: number }> {
  return apiFetch(`/presentations/${presentationId}/url`);
}
