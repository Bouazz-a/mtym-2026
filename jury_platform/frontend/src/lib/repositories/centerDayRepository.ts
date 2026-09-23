import type { Center, CenterDay, PoolDetails, ScheduleSlot } from "@/types";
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

// Draws the day's pools on the server, replacing the ones there.
export function saveDraw(dayId: string): Promise<PoolDetails[]> {
  return apiFetch<PoolDetails[]>(`/center-days/${dayId}/draw`, { method: "PUT" });
}

// Draws pools for the teams that had none, leaving the pools already there
// (drawn or composed by hand) untouched.
export function completeDraw(dayId: string): Promise<PoolDetails[]> {
  return apiFetch<PoolDetails[]>(`/center-days/${dayId}/draw`, { method: "POST" });
}

// Marks the day's composition as settled (or reopens it). Teams without a
// pool are allowed; a pool still in draft is not.
export function setDrawValidation(dayId: string, validated: boolean): Promise<CenterDay> {
  return apiFetch<CenterDay>(`/center-days/${dayId}/draw-validation`, { method: "PUT", body: { validated } });
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
