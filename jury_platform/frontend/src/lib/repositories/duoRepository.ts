import type { JuryDuo } from "@/types";
import { apiFetch } from "@/lib/api/client";

// Jury duos of a center day. `warnings` lists jurors also seated in a duo
// of another center on the same date (allowed, but worth a look).

type DuoResult = { duo: JuryDuo; warnings: string[] };

export function getDuos(centerDayId?: string): Promise<JuryDuo[]> {
  return apiFetch<JuryDuo[]>("/duos", { params: { centerDayId } });
}

export function createDuo(centerDayId: string, accountIds: [string, string]): Promise<DuoResult> {
  return apiFetch<DuoResult>("/duos", { method: "POST", body: { centerDayId, accountIds } });
}

export function updateDuo(id: string, accountIds: [string, string]): Promise<DuoResult> {
  return apiFetch<DuoResult>(`/duos/${id}`, { method: "PUT", body: { accountIds } });
}

// Its passages go back to "no duo"; refused once the duo has graded.
export function deleteDuo(id: string): Promise<void> {
  return apiFetch<void>(`/duos/${id}`, { method: "DELETE" });
}
