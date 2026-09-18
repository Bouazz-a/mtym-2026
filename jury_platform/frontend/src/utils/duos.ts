import type { Juror, JuryDuo, PoolDetails } from "@/types";

function jurorShortName(j: Juror): string {
  return `${j.firstName} ${j.lastName[0] ?? ""}.`;
}

// "Duo 2 · Ines U. & Omar U."
export function duoLabel(duo: JuryDuo): string {
  return `Duo ${duo.number} · ${duo.members.map(jurorShortName).join(" & ")}`;
}

// Duos judging more than one passage of the pool — allowed, but a duo
// should judge at most one passage per pool.
export function repeatedDuos(pool: PoolDetails): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const p of pool.passages) {
    if (!p.duo) continue;
    if (seen.has(p.duo.id)) repeated.add(p.duo.id);
    seen.add(p.duo.id);
  }
  return repeated;
}
