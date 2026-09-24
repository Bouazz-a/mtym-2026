import type { MyReport, ReportAssignmentBoard } from "@/types";
import { apiFetch } from "@/lib/api/client";

// The reports of problems a team doesn't defend, each corrected by one
// juror. The admin hands them out by hand or automatically; a juror lists
// theirs in "Mes rapports".

export function getReportAssignments(): Promise<ReportAssignmentBoard> {
  return apiFetch<ReportAssignmentBoard>("/report-assignments");
}

// accountId null takes the report back; refused once it's corrected.
export function assignReport(reportId: string, accountId: string | null): Promise<void> {
  return apiFetch<void>(`/report-assignments/${reportId}`, { method: "PUT", body: { accountId } });
}

// Computed on the server: "fill" hands out the reports without a juror,
// "replace" redoes everything; corrected reports never move.
export type ReportAutoMode = "fill" | "replace";

export interface ReportAutoResult {
  changed: number;
  assigned: number;
  unassigned: number;
  offSpecialty: number; // reports held outside their juror's problems
}

export function autoAssignReports(mode: ReportAutoMode): Promise<ReportAutoResult> {
  return apiFetch<ReportAutoResult>("/report-assignments/auto", { method: "POST", body: { mode } });
}

export function getMyReports(): Promise<MyReport[]> {
  return apiFetch<MyReport[]>("/report-assignments/mine");
}
