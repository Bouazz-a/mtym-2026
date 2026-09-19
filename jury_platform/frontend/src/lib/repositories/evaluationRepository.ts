import type { OralEvaluation, ReportEvaluation } from "@/types";
import { apiFetch } from "@/lib/api/client";

// A juror only ever gets back their own evaluations; admins get everyone's.
// Saving upserts the evaluation and its per-criterion grades in one request.

type GradeInput = { criterionId: string; score: number; remark?: string };

export function getOralEvaluations(passageId?: string): Promise<OralEvaluation[]> {
  return apiFetch<OralEvaluation[]>("/oral-evaluations", { params: { passageId } });
}

// The role is read from the passage server-side.
export function saveOralEvaluation(input: {
  passageId: string;
  teamId: string;
  globalRemark?: string;
  grades: GradeInput[];
}): Promise<OralEvaluation> {
  return apiFetch<OralEvaluation>("/oral-evaluations", { method: "POST", body: input });
}

export function getReportEvaluations(teamId?: string): Promise<ReportEvaluation[]> {
  return apiFetch<ReportEvaluation[]>("/report-evaluations", { params: { teamId } });
}

export function saveReportEvaluation(input: {
  teamId: string;
  problemNumber: number;
  globalRemark?: string;
  grades: GradeInput[];
}): Promise<ReportEvaluation> {
  return apiFetch<ReportEvaluation>("/report-evaluations", { method: "POST", body: input });
}
