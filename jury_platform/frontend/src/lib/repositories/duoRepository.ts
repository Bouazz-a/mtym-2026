import type { JuryDuo } from "@/types";
import { apiFetch } from "@/lib/api/client";

// Jury duos of a center day. `warnings` lists jurors also seated in a duo
// of another center on the same date (allowed, but worth a look).

type DuoResult = { duo: JuryDuo; warnings: string[] };

export function getDuos(centerDayId?: string): Promise<JuryDuo[]> {
  return apiFetch<JuryDuo[]>("/duos", { params: { centerDayId } });
}

export function createDuo(centerDayId: string, accountIds: [string, string], problemNumber: number | null): Promise<DuoResult> {
  return apiFetch<DuoResult>("/duos", { method: "POST", body: { centerDayId, accountIds, problemNumber } });
}

// Its jurors, its problem (the problem can change at any time), or both
export function updateDuo(id: string, changes: { accountIds?: [string, string]; problemNumber?: number | null }): Promise<DuoResult> {
  return apiFetch<DuoResult>(`/duos/${id}`, { method: "PUT", body: changes });
}

// Its passages go back to "no duo"; refused once the duo has graded.
export function deleteDuo(id: string): Promise<void> {
  return apiFetch<void>(`/duos/${id}`, { method: "DELETE" });
}

// Automatic assignment, computed on the server: the day's passages are
// spread between the duos already formed by hand. "fill" keeps the duos
// already placed, "replace" recomputes the day; graded passages never move.
export type AutoAssignMode = "fill" | "replace";

export interface AutoAssignResult {
  changed: number;
  assigned: number; // passages with a duo
  withoutDuo: number; // passages left without a duo (not enough duos)
  samePool: number; // times a duo judges the same pool twice
  specialized: number; // passages judged by a duo of their problem
  warnings: string[];
}

export function autoAssignDuos(centerDayId: string, mode: AutoAssignMode): Promise<AutoAssignResult> {
  return apiFetch<AutoAssignResult>("/duos/auto-assign", { method: "POST", body: { centerDayId, mode } });
}
