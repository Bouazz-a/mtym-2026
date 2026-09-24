import type { Juror, JuryDuo, PoolDetails } from "@/types";

function jurorShortName(j: Juror): string {
  return `${j.firstName} ${j.lastName[0] ?? ""}.`;
}

// "Ines U. & Omar U."
export function duoMembers(duo: JuryDuo): string {
  return duo.members.map(jurorShortName).join(" & ");
}

// A juror's specialty: the problem of their duos, all days and centers
// together, leaving out `exceptDuoId` (the duo being edited). One at most —
// several only happen with duos formed before that rule.
export function jurorSpecialties(duos: JuryDuo[], jurorId: string, exceptDuoId?: string): number[] {
  const problems = duos
    .filter((d) => d.id !== exceptDuoId && d.problemNumber !== null && d.members.some((m) => m.id === jurorId))
    .map((d) => d.problemNumber!);
  return [...new Set(problems)].sort();
}

// Whether jurors can sit together in a duo of `problem` (null: not chosen
// yet): together they may hold one specialty at most, the duo's if it has
// one. Mirrors duoProblemFor on the server.
export function specialtiesAgree(specialties: number[][], problem: number | null): boolean {
  return new Set([...specialties.flat(), ...(problem === null ? [] : [problem])]).size <= 1;
}

// "Duo 1 · P2", or "Duo 1" while the duo has no problem
export function duoLabel(duo: JuryDuo): string {
  return duo.problemNumber ? `Duo ${duo.number} · P${duo.problemNumber}` : `Duo ${duo.number}`;
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
