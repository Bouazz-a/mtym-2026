import type { MailingAttachment, MailingBoard, MailingPreview } from "@/types";
import { apiFetch } from "@/lib/api/client";

// The convocation emails to the teams: one per team, sent one team per
// request (the page loops over a day). A test goes to the admin alone.

export function getMailings(centerDayId: string): Promise<MailingBoard> {
  return apiFetch<MailingBoard>("/mailings", { params: { centerDayId } });
}

export function getMailingPreview(teamId: string): Promise<MailingPreview> {
  return apiFetch<MailingPreview>(`/mailings/${teamId}/preview`);
}

// `to`: a test's address (the admin's own when left out); ignored for a real send
export function sendMailing(teamId: string, test = false, to?: string): Promise<{ test: boolean; sentTo: string[]; attachments: MailingAttachment[] }> {
  return apiFetch(`/mailings/${teamId}/send`, { method: "POST", body: { test, ...(test && to ? { to } : {}) } });
}
