import type {
  Criterion, OralEvaluation, OralGrade, PassageRole, ReportEvaluation, ReportGrade, ReportType,
} from "@/types";
import { apiFetch } from "@/lib/api/client";

// The backend saves an evaluation and all of its per-criterion grades in
// one request (one upsert transaction — see backend/src/routes/report-
// evaluations.ts and oral-evaluations.ts), and returns them nested
// together. The old localStorage version modeled them as two separate
// tables you had to upsert one row at a time (upsertReportEvaluation, then
// upsertReportGrade per criterion) — that split doesn't exist on the wire
// any more, so these two shapes replace ReportEvaluation/OralEvaluation
// wherever a fetched (not freshly-composed) evaluation is used.
export type ReportEvaluationWithGrades = ReportEvaluation & { grades: ReportGrade[] };
export type OralEvaluationWithGrades = OralEvaluation & { grades: OralGrade[] };

// ─── Criteria ──────────────────────────────────────────────────────────

export function getCriteria(): Promise<Criterion[]> {
  return apiFetch<Criterion[]>("/criteria");
}

// Pure filters over an already-fetched criteria list — a page that needs
// several slices (e.g. all three oral roles) only fetches the list once.
export function filterReportCriteria(criteria: Criterion[], problemNumber: number): Criterion[] {
  return criteria
    .filter(c => c.type === "report" && c.problemNumber === problemNumber)
    .sort((a, b) => a.order - b.order);
}

export function filterOralCriteria(criteria: Criterion[], role: PassageRole): Criterion[] {
  return criteria
    .filter(c => c.type === "oral" && c.role === role)
    .sort((a, b) => a.order - b.order);
}

// Admin/scientific-only management (the organizer's criteria editor).
export function createCriterion(data: Omit<Criterion, "id">): Promise<Criterion> {
  return apiFetch<Criterion>("/criteria", { method: "POST", body: data });
}

export function updateCriterion(id: string, patch: Partial<Omit<Criterion, "id">>): Promise<Criterion> {
  return apiFetch<Criterion>(`/criteria/${id}`, { method: "PUT", body: patch });
}

export function deleteCriterion(id: string): Promise<void> {
  return apiFetch<void>(`/criteria/${id}`, { method: "DELETE" });
}

// ─── Report evaluations (rapport intermédiaire + rapports finaux) ────────

// Server-side visibility rules apply: a jury member only ever gets back
// their own evaluations; teamId is an optional extra filter for organizers.
export function getReportEvaluations(teamId?: string): Promise<ReportEvaluationWithGrades[]> {
  return apiFetch<ReportEvaluationWithGrades[]>("/report-evaluations", { params: { teamId } });
}

export function saveReportEvaluation(input: {
  teamId: string;
  reportType: ReportType;
  problemNumber: number; // 0 for rapport intermédiaire (spans all problems)
  overallScore?: number; // rapport intermédiaire only — 1..4
  globalRemark?: string;
  grades?: { criterionId: string; score: number; remark?: string }[];
}): Promise<ReportEvaluationWithGrades> {
  return apiFetch<ReportEvaluationWithGrades>("/report-evaluations", { method: "POST", body: input });
}

// ─── Oral evaluations (passage grading) ───────────────────────────────

export function getOralEvaluations(passageId?: string): Promise<OralEvaluationWithGrades[]> {
  return apiFetch<OralEvaluationWithGrades[]>("/oral-evaluations", { params: { passageId } });
}

export function saveOralEvaluation(input: {
  passageId: string;
  teamId: string;
  role: PassageRole;
  globalRemark?: string;
  grades?: { criterionId: string; score: number; remark?: string }[];
}): Promise<OralEvaluationWithGrades> {
  return apiFetch<OralEvaluationWithGrades>("/oral-evaluations", { method: "POST", body: input });
}
