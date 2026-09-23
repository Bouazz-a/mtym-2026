import type { CenterDay, ScheduleSlot } from "@/types";

// A center day's schedule: slot n holds passage n of every pool (the pools
// play in parallel). Each day has its own; the admin edits it on the Jury
// page and every passage time follows.

export const DEFAULT_SCHEDULE: ScheduleSlot[] = [
  { start: "13:15", minutes: 60 },
  { start: "14:30", minutes: 60 },
  { start: "16:00", minutes: 60 },
  { start: "17:15", minutes: 60 },
];

// Range of the start-time sliders, and duration bounds (as the API checks)
export const SLIDER_MIN = 7 * 60;
export const SLIDER_MAX = 21 * 60;
export const MIN_MINUTES = 15;
export const MAX_MINUTES = 240;
const DAY_END = 24 * 60;

export function toMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

function fromMinutes(total: number): string {
  const m = Math.max(0, Math.min(DAY_END - 1, Math.round(total)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function slotEnd(slot: ScheduleSlot): string {
  return fromMinutes(toMinutes(slot.start) + slot.minutes);
}

// A passage's time on its day: "13:15" – "14:15"
export function slotTime(
  day: Pick<CenterDay, "schedule"> | null | undefined,
  slot: number,
): { start: string; end: string } | null {
  const s = (day?.schedule ?? DEFAULT_SCHEDULE)[slot - 1];
  return s ? { start: s.start, end: slotEnd(s) } : null;
}

// Minutes between slot i - 1's end and slot i's start
export function breakMinutes(schedule: ScheduleSlot[], i: number): number {
  return toMinutes(schedule[i].start) - (toMinutes(schedule[i - 1].start) + schedule[i - 1].minutes);
}

// Later slots keep their times unless the edit makes them overlap: then
// they're pushed to start right after the previous one ends.
function pushFollowing(schedule: ScheduleSlot[], from: number): ScheduleSlot[] {
  const next = schedule.map((s) => ({ ...s }));
  for (let j = from + 1; j < next.length; j++) {
    const prevEnd = toMinutes(next[j - 1].start) + next[j - 1].minutes;
    if (toMinutes(next[j].start) < prevEnd) next[j].start = fromMinutes(prevEnd);
  }
  return next;
}

// Moves slot i to `start` (minutes). It can't start before slot i - 1
// ends, nor push the day past midnight.
export function moveSlot(schedule: ScheduleSlot[], i: number, start: number): ScheduleSlot[] {
  const prevEnd = i > 0 ? toMinutes(schedule[i - 1].start) + schedule[i - 1].minutes : 0;
  const tail = schedule.slice(i).reduce((sum, s) => sum + s.minutes, 0); // if pushed back to back
  const clamped = Math.max(prevEnd, Math.min(start, DAY_END - tail));
  const next = schedule.map((s, j) => (j === i ? { ...s, start: fromMinutes(clamped) } : s));
  return pushFollowing(next, i);
}

// Changes slot i's duration, pushing later slots if they'd overlap.
export function resizeSlot(schedule: ScheduleSlot[], i: number, minutes: number): ScheduleSlot[] {
  const clamped = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(minutes)));
  const next = schedule.map((s, j) => (j === i ? { ...s, minutes: clamped } : s));
  return pushFollowing(next, i);
}

export function sameSchedule(a: ScheduleSlot[], b: ScheduleSlot[]): boolean {
  return a.length === b.length && a.every((s, i) => s.start === b[i].start && s.minutes === b[i].minutes);
}
