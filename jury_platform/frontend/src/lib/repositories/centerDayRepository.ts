import type { Center, CenterDay, PoolDetails, ScheduleSlot } from "@/types";
import type { GeneratedRound } from "@/lib/services/tournamentOptimizer";
import { apiFetch } from "@/lib/api/client";

export function getCenterDays(center?: Center): Promise<CenterDay[]> {
  return apiFetch<CenterDay[]>("/center-days", { params: { center } });
}

export function createCenterDay(center: Center, date: string): Promise<CenterDay> {
  return apiFetch<CenterDay>("/center-days", { method: "POST", body: { center, date } });
}

export function updateCenterDay(id: string, date: string): Promise<CenterDay> {
  return apiFetch<CenterDay>(`/center-days/${id}`, { method: "PUT", body: { date } });
}

// The day's passage times — all its pools follow.
export function updateSchedule(id: string, slots: ScheduleSlot[]): Promise<CenterDay> {
  return apiFetch<CenterDay>(`/center-days/${id}/schedule`, { method: "PUT", body: { slots } });
}

export function deleteCenterDay(id: string): Promise<void> {
  return apiFetch<void>(`/center-days/${id}`, { method: "DELETE" });
}

// Spreads the center's teams that have no day yet across its days.
export function distributeTeams(center: Center): Promise<{ assigned: number }> {
  return apiFetch("/center-days/distribute", { method: "POST", body: { center } });
}

// Replaces the day's pools with a draw from generateQualifsDay. The backend
// re-checks the qualifs rules and assigns its own ids.
export function saveDraw(dayId: string, draw: GeneratedRound): Promise<PoolDetails[]> {
  const pools = draw.pools.map((pool) => ({
    label: pool.label,
    passages: draw.passages
      .filter((p) => p.poolId === pool.id)
      .map((p) => ({
        label: p.label,
        problemNumber: p.problemNumber,
        defenderTeamId: p.defenderTeamId,
        opponentTeamId: p.opponentTeamId,
        reporterTeamId: p.reporterTeamId,
        extraTeamId: p.extraTeamId ?? null,
        slot: p.slot,
      })),
  }));
  return apiFetch<PoolDetails[]>(`/center-days/${dayId}/draw`, { method: "PUT", body: { pools } });
}

export function deleteDraw(dayId: string): Promise<void> {
  return apiFetch<void>(`/center-days/${dayId}/pools`, { method: "DELETE" });
}

// The two teams trade places in every passage of the day.
export function swapTeams(dayId: string, teamA: string, teamB: string): Promise<PoolDetails[]> {
  return apiFetch<PoolDetails[]>(`/center-days/${dayId}/swap-teams`, {
    method: "POST",
    body: { teamA, teamB },
  });
}
