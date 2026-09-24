import type { Criterion } from "@/types";
import { apiFetch } from "@/lib/api/client";

// The grading grids: one per report problem, one per graded oral role.

export function getCriteria(): Promise<Criterion[]> {
  return apiFetch<Criterion[]>("/criteria");
}

export function createCriterion(data: Omit<Criterion, "id">): Promise<Criterion> {
  return apiFetch<Criterion>("/criteria", { method: "POST", body: data });
}

export function updateCriterion(id: string, patch: Partial<Omit<Criterion, "id">>): Promise<Criterion> {
  return apiFetch<Criterion>(`/criteria/${id}`, { method: "PUT", body: patch });
}

// Problem `to`'s report grid becomes a copy of problem `from`'s (its own
// criteria are replaced). Refused once grades use the grid it replaces.
export function copyReportCriteria(from: number, to: number): Promise<Criterion[]> {
  return apiFetch<Criterion[]>("/criteria/copy", { method: "POST", body: { from, to } });
}

// Refused once grades use the criterion.
export function deleteCriterion(id: string): Promise<void> {
  return apiFetch<void>(`/criteria/${id}`, { method: "DELETE" });
}
