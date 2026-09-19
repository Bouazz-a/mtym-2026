// A qualifs day: every pool plays its passages in parallel, passage n of
// each pool in slot n. One hour each, 15 min breaks around a 30 min one.
export const PASSAGE_SLOTS = [
  { start: "13:15", end: "14:15" },
  { start: "14:30", end: "15:30" },
  { start: "16:00", end: "17:00" },
  { start: "17:15", end: "18:15" },
] as const;

// Passage number within its pool: "CAS-A1P3" -> 3 (0 if the label has none)
export function passageNumber(label: string): number {
  const match = /P(\d+)$/.exec(label);
  return match ? Number(match[1]) : 0;
}

// "14:15" -> "14:30" = 15
export function minutesBetween(from: string, to: string): number {
  const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  return minutes(to) - minutes(from);
}
