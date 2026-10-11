import type { OralEvaluation, ReportEvaluation } from "@/types";
import { apiFetch } from "@/lib/api/client";

// A jury account only ever gets back its own evaluations; admins get
// everyone's, or their own with `mine` — what the juror pages ask for, since
// an admin may also judge. Saving upserts the evaluation and its
// per-criterion grades in one request.

type GradeInput = { criterionId: string; score: number; remark?: string };

const mineParam = (mine?: boolean) => (mine ? "1" : undefined);

export function getOralEvaluations(opts: { passageId?: string; mine?: boolean } = {}): Promise<OralEvaluation[]> {
  return apiFetch<OralEvaluation[]>("/oral-evaluations", { params: { passageId: opts.passageId, mine: mineParam(opts.mine) } });
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

export function getReportEvaluations(opts: { teamId?: string; mine?: boolean } = {}): Promise<ReportEvaluation[]> {
  return apiFetch<ReportEvaluation[]>("/report-evaluations", { params: { teamId: opts.teamId, mine: mineParam(opts.mine) } });
}

export function saveReportEvaluation(input: {
  teamId: string;
  problemNumber: number;
  globalRemark?: string;
  grades: GradeInput[];
}): Promise<ReportEvaluation> {
  return apiFetch<ReportEvaluation>("/report-evaluations", { method: "POST", body: input });
}

// ─── Admins: a juror's note, corrected or removed ─────────────────────
// The whole grid is sent again; the change goes to the journal.

type NoteEdit = { globalRemark?: string; grades: GradeInput[] };

export function updateOralEvaluation(id: string, input: NoteEdit): Promise<OralEvaluation> {
  return apiFetch<OralEvaluation>(`/oral-evaluations/${id}`, { method: "PUT", body: input });
}

export function deleteOralEvaluation(id: string): Promise<void> {
  return apiFetch<void>(`/oral-evaluations/${id}`, { method: "DELETE" });
}

export function updateReportEvaluation(id: string, input: NoteEdit): Promise<ReportEvaluation> {
  return apiFetch<ReportEvaluation>(`/report-evaluations/${id}`, { method: "PUT", body: input });
}

export function deleteReportEvaluation(id: string): Promise<void> {
  return apiFetch<void>(`/report-evaluations/${id}`, { method: "DELETE" });
}
