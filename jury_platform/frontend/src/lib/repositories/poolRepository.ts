import type { Center, Passage, PassageDetails, PoolDetails, PoolGrid } from "@/types";
import { apiFetch } from "@/lib/api/client";

// Pools come with their day and passages (each with its duo). Admins get
// every pool, jurors the pools where their duo judges a passage. Sorted
// naturally: CAS-A2 before CAS-A10 (the API sorts labels as text).
export async function getPools(filter: { center?: Center; centerDayId?: string } = {}): Promise<PoolDetails[]> {
  const pools = await apiFetch<PoolDetails[]>("/pools", { params: filter });
  return pools.sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
}

// ─── Pools composed by hand ───────────────────────────────────────────

// An empty pool of 3 or 4 teams, labelled after the day's series (CAS-A5).
export function createPool(centerDayId: string, size: 3 | 4): Promise<PoolDetails> {
  return apiFetch<PoolDetails>("/pools", { method: "POST", body: { centerDayId, size } });
}

// The whole grid at once: complete, it becomes the pool's passages;
// incomplete, it is kept as a draft to come back to. Refused once one of
// the pool's passages is graded.
export function savePool(id: string, grid: PoolGrid): Promise<PoolDetails> {
  return apiFetch<PoolDetails>(`/pools/${id}`, { method: "PUT", body: grid });
}

export function deletePool(id: string): Promise<void> {
  return apiFetch<void>(`/pools/${id}`, { method: "DELETE" });
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
