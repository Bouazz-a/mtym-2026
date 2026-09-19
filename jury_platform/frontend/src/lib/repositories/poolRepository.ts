import type { Center, Passage, PassageDetails, PoolDetails } from "@/types";
import { apiFetch } from "@/lib/api/client";

// Pools come with their day and passages (each with its duo). Admins get
// every pool, jurors the pools where their duo judges a passage. Sorted
// naturally: CAS-A2 before CAS-A10 (the API sorts labels as text).
export async function getPools(filter: { center?: Center; centerDayId?: string } = {}): Promise<PoolDetails[]> {
  const pools = await apiFetch<PoolDetails[]>("/pools", { params: filter });
  return pools.sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
}

type PassagePatch = Partial<
  Pick<Passage, "problemNumber" | "defenderTeamId" | "opponentTeamId" | "reporterTeamId">
> & {
  extraTeamId?: string | null;
  room?: string | null;
};

// Room, or a manual lineup fix — the lineup is frozen once graded.
export function updatePassage(id: string, patch: PassagePatch): Promise<Passage> {
  return apiFetch<Passage>(`/passages/${id}`, { method: "PUT", body: patch });
}

// The duo judging a passage (null = none). `warnings`: the same duo on
// another passage of the pool, or in the same slot.
export function setPassageDuo(
  passageId: string,
  duoId: string | null,
): Promise<{ passage: PassageDetails; warnings: string[] }> {
  return apiFetch(`/passages/${passageId}/duo`, { method: "PUT", body: { duoId } });
}

// One passage with its duo and its pool (day, sibling passages). A juror
// only gets the passages their duo judges.
export function getPassage(id: string): Promise<PassageDetails & { pool: PoolDetails }> {
  return apiFetch(`/passages/${id}`);
}
