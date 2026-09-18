import type { Center, Round } from "@/types";

export const CENTERS: { value: Center; label: string; code: string }[] = [
  { value: "casablanca", label: "Casablanca", code: "CAS" },
  { value: "rabat", label: "Rabat", code: "RAB" },
  { value: "martil", label: "Martil", code: "MAR" },
  { value: "benguerir", label: "Benguerir", code: "BEN" },
  { value: "agadir", label: "Agadir", code: "AGA" },
  { value: "fez", label: "Fès", code: "FES" },
  { value: "oujda", label: "Oujda", code: "OUJ" },
  { value: "online", label: "En ligne", code: "ONL" },
];

export function centerLabel(center: Center): string {
  return CENTERS.find((c) => c.value === center)?.label ?? center;
}

// "2026-10-24" -> "sam. 24 oct."
export function formatDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Pool labels are prefixed with the center code and day number so they stay
// unique across the whole qualification: "CAS-J2-" + "A1" -> "CAS-J2-A1".
export function poolLabelPrefix(center: Center, dayIndex: number): string {
  const code = CENTERS.find((c) => c.value === center)?.code ?? center.slice(0, 3).toUpperCase();
  return `${code}-J${dayIndex + 1}-`;
}

export function buildPoolLabel(round: Round, poolIndexInRound: number): string {
  const letter = round === 1 ? "A" : "B";
  return `${letter}${poolIndexInRound + 1}`;
}

export function buildPassageLabel(poolLabel: string, passageIndex: number): string {
  return `${poolLabel}P${passageIndex + 1}`;
}
