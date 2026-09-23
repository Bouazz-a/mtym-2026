import type { Center } from "@prisma/client";
import { db } from "../db";

// The qualification centers: their names (journal) and the codes their pool
// labels start with. Pool labels carry the center code and one letter per
// day of that center, in date order — "CAS-B1" is pool 1 of Casablanca's
// second day — so they stay unique across the whole qualification.

const CENTERS: Record<Center, { label: string; code: string }> = {
  casablanca: { label: "Casablanca", code: "CAS" },
  rabat: { label: "Rabat", code: "RAB" },
  martil: { label: "Martil", code: "MAR" },
  benguerir: { label: "Benguerir", code: "BEN" },
  agadir: { label: "Agadir", code: "AGA" },
  fez: { label: "Fès", code: "FES" },
  oujda: { label: "Oujda", code: "OUJ" },
  online: { label: "En ligne", code: "ONL" },
};

export function centerName(center: string): string {
  return CENTERS[center as Center]?.label ?? center;
}

// "CAS-B" for the second day of Casablanca
export async function poolLabelPrefix(day: { id: string; center: Center }): Promise<string> {
  const days = await db.centerDay.findMany({ where: { center: day.center }, orderBy: { date: "asc" }, select: { id: true } });
  const code = CENTERS[day.center].code;
  return `${code}-${String.fromCharCode(65 + days.findIndex((d) => d.id === day.id))}`;
}

// A pool made by hand takes the first free number of the series…
export function firstFreeLabel(prefix: string, used: Set<string>): string {
  let index = 1;
  while (used.has(`${prefix}${index}`)) index++;
  return `${prefix}${index}`;
}

// …while completing a draw continues after the highest one.
export function nextPoolNumber(labels: string[]): number {
  return labels.reduce((max, label) => Math.max(max, Number(label.match(/(\d+)$/)?.[1] ?? 0)), 0) + 1;
}
