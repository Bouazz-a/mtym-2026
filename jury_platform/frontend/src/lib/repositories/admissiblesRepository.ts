import type { AdmissibleList, AdmissiblesImpact } from "@/types";
import { apiFetch } from "@/lib/api/client";

// The list of admissible teams (page Admissibles). The interface ranks the
// teams; the server keeps the list it is sent and takes back from their
// jurors the other teams' reports not graded yet. Null: no list fixed.

export function getAdmissibles(): Promise<AdmissibleList | null> {
  return apiFetch<AdmissibleList | null>("/admissibles");
}

// What fixing this list would do to the reports already handed out
export function previewAdmissibles(teamIds: string[]): Promise<AdmissiblesImpact> {
  return apiFetch<AdmissiblesImpact>("/admissibles/preview", { method: "POST", body: { teamIds } });
}

export function fixAdmissibles(input: { places: number; lambda: number; teamIds: string[] }): Promise<{ list: AdmissibleList; impact: AdmissiblesImpact }> {
  return apiFetch("/admissibles", { method: "PUT", body: input });
}

// Every report counts again; the reports taken back stay unassigned
export function reopenAdmissibles(): Promise<void> {
  return apiFetch<void>("/admissibles", { method: "DELETE" });
}
