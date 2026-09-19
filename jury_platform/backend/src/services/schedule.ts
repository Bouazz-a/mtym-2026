import { z } from "zod";

// A center day's schedule: slot n holds passage n of every pool (the pools
// play in parallel). Four slots, in order, never overlapping.

export interface ScheduleSlot {
  start: string; // "HH:MM"
  minutes: number;
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export const ScheduleSchema = z
  .array(z.object({
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure au format HH:MM"),
    minutes: z.number().int().min(15, "Un passage dure au moins 15 min").max(240, "Un passage dure au plus 4 h"),
  }))
  .length(4, "Il faut exactement 4 créneaux")
  .superRefine((slots, ctx) => {
    slots.forEach((slot, i) => {
      const end = toMinutes(slot.start) + slot.minutes;
      if (end > 24 * 60) ctx.addIssue({ code: "custom", message: `Le passage ${i + 1} finit après minuit` });
      const next = slots[i + 1];
      if (next && toMinutes(next.start) < end) {
        ctx.addIssue({ code: "custom", message: `Le passage ${i + 2} commence avant la fin du passage ${i + 1}` });
      }
    });
  });

// "passage 2 de 14:30 à 14:45, durée de 60 à 45 min" for each slot that changed
export function describeScheduleChange(before: ScheduleSlot[], after: ScheduleSlot[]): string {
  const changes = after.flatMap((slot, i) => {
    const old = before[i];
    const parts: string[] = [];
    if (old?.start !== slot.start) parts.push(`de ${old?.start ?? "?"} à ${slot.start}`);
    if (old?.minutes !== slot.minutes) parts.push(`durée de ${old?.minutes ?? "?"} à ${slot.minutes} min`);
    return parts.length ? [`passage ${i + 1} ${parts.join(", ")}`] : [];
  });
  return changes.join(" ; ");
}

// { "passage 1": "13:15, 60 min", … } — how the journal shows a schedule
export function scheduleRecord(slots: ScheduleSlot[]): Record<string, string> {
  return Object.fromEntries(slots.map((s, i) => [`passage ${i + 1}`, `${s.start}, ${s.minutes} min`]));
}
