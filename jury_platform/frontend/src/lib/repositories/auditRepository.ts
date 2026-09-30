import type { AuditEntry } from "@/types";
import { apiFetch } from "@/lib/api/client";

// The journal of admin changes, newest first.
export function getAuditLog(): Promise<AuditEntry[]> {
  return apiFetch<AuditEntry[]>("/audit-log");
}

// The journal since a date (ISO): the dashboard's recent activity
export function getRecentActivity(from: string): Promise<AuditEntry[]> {
  return apiFetch<AuditEntry[]>("/audit-log", { params: { from } });
}
