import type { Center, Passage, PassageDetails, PoolDetails } from "@/types";
import { apiFetch } from "@/lib/api/client";

// Pools come with their day and passages (each with its duo). Admins get
// every pool, jurors the pools where their duo judges a passage.
export function getPools(filter: { center?: Center; centerDayId?: string } = {}): Promise<PoolDetails[]> {
  return apiFetch<PoolDetails[]>("/pools", { params: filter });
}

type PassagePatch = Partial<
  Pick<Passage, "problemNumber" | "defenderTeamId" | "opponentTeamId" | "reporterTeamId">
> & {
  extraTeamId?: string | null;
  timeSlot?: string | null;
  room?: string | null;
};

// Schedule, or a manual lineup fix — the lineup is frozen once graded.
export function updatePassage(id: string, patch: PassagePatch): Promise<Passage> {
  return apiFetch<Passage>(`/passages/${id}`, { method: "PUT", body: patch });
}

// The duo judging a passage (null = none). `warnings`: the same duo on
// another passage of the pool, or at the same time slot.
export function setPassageDuo(
  passageId: string,
  duoId: string | null,
): Promise<{ passage: PassageDetails; warnings: string[] }> {
  return apiFetch(`/passages/${passageId}/duo`, { method: "PUT", body: { duoId } });
}
