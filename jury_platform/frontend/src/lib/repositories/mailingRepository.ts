import type { MailingAttachment, MailingBoard, MailingPreview, MailTemplate, MailTemplateInfo } from "@/types";
import { apiFetch } from "@/lib/api/client";

// The convocation emails to the teams: one per team, sent one team per
// request (the page loops over a day). A test goes to the admin alone.

export function getMailings(centerDayId: string): Promise<MailingBoard> {
  return apiFetch<MailingBoard>("/mailings", { params: { centerDayId } });
}

export function getMailingPreview(teamId: string): Promise<MailingPreview> {
  return apiFetch<MailingPreview>(`/mailings/${teamId}/preview`);
}

// The email with a template not saved yet (the editor's live preview)
export function getDraftPreview(teamId: string, template: MailTemplate): Promise<MailingPreview> {
  return apiFetch<MailingPreview>(`/mailings/${teamId}/preview`, { method: "POST", body: { template } });
}

// The admin's subject, title and opening
export function getMailTemplate(): Promise<MailTemplateInfo> {
  return apiFetch<MailTemplateInfo>("/mailings/template");
}

export function saveMailTemplate(template: MailTemplate): Promise<MailTemplateInfo> {
  return apiFetch<MailTemplateInfo>("/mailings/template", { method: "PUT", body: template });
}

export function resetMailTemplate(): Promise<MailTemplateInfo> {
  return apiFetch<MailTemplateInfo>("/mailings/template", { method: "DELETE" });
}

// `to`: a test's address (the admin's own when left out); ignored for a real send
export function sendMailing(teamId: string, test = false, to?: string): Promise<{ test: boolean; sentTo: string[]; attachments: MailingAttachment[] }> {
  return apiFetch(`/mailings/${teamId}/send`, { method: "POST", body: { test, ...(test && to ? { to } : {}) } });
}
