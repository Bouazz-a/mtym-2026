import type {
  JuryAssignment,
  JuryMember,
  JuryPassageAssignment,
  Passage,
  ReportType,
  Team,
} from "@/types";
import {
  getJuryMembers,
  getJuryAssignments,
  saveJuryAssignments,
  saveJuryPassageAssignments,
  getJurorLoads,
} from "@/lib/repositories/juryRepository";
export type { JurorLoad } from "@/lib/repositories/juryRepository";
import { getTeams } from "@/lib/repositories/teamRepository";
import { getPassages } from "@/lib/repositories/poolRepository";
import { ConflictError } from "./errors";

// juryAssignmentService — automatic distribution of jury workload.
//
// Two distinct flows:
//
//  1) Reports (written) — every team gets one juror per report type.
//     Workload balance is the HARD constraint: for J jurors and T teams,
//     each juror receives either ⌊T/J⌋ or ⌈T/J⌉ teams of a given report
//     type. Grader independence (a juror should not grade both the
//     intermédiaire AND the final of the same team) is treated as a
//     SOFT preference enforced via post-hoc swaps that preserve each
//     juror's load count.
//
//  2) Passages (oral) — every passage gets exactly two jurors. Load is
//     distributed as evenly as possible across the jury panel.
//
// Teams are shuffled before round-robin so consecutive runs produce
// different but still balanced assignments. The intermédiaire and final
// distributions use independent shuffles.
//
// Saving: the backend's bulk-save endpoints (POST /api/jury-assignments/
// save and /api/jury-passage-assignments/save) each wipe and rewrite the
// *whole* table in one transaction — there's no per-row upsert any more.
// autoAssignAll can just POST the freshly computed lists. autoAssignReports
// only wants to regenerate one report type, so it composes the fresh rows
// with the other type's untouched rows before saving the combined list.

export const PASSAGES_PER_JUROR_TARGET = 2;
export const JURORS_PER_PASSAGE = 2;

export interface AssignmentSummary {
  reportAssignments: JuryAssignment[];
  passageAssignments: JuryPassageAssignment[];
  jurorsCount: number;
  teamsCount: number;
  passagesCount: number;
}

// ─── Public API ────────────────────────────────────────────────────────

// Regenerate ALL jury work for both report types and passages.
// Use cases: initial bootstrap, full re-roll after pool regeneration.
export async function autoAssignAll(): Promise<AssignmentSummary> {
  const [jurors, teams, passages] = await Promise.all([
    sortedJurors(),
    sortedTeams(),
    sortedPassages(),
  ]);
  validateJurorCount(jurors.length);

  // Run intermédiaire first, then feed its result as the avoidance set
  // for the final pass so the soft swap step can resolve juror-vs-team
  // collisions across the two report types without altering workload.
  const inter = computeReportAssignments(jurors, teams, "intermediaire");
  const final = computeReportAssignments(jurors, teams, "final", inter);
  const reportAssignments = [...inter, ...final];

  const passageAssignments = computePassageAssignments(jurors, passages);

  await saveJuryAssignments(reportAssignments);
  await saveJuryPassageAssignments(passageAssignments);

  return {
    reportAssignments,
    passageAssignments,
    jurorsCount: jurors.length,
    teamsCount: teams.length,
    passagesCount: passages.length,
  };
}

// Regenerate only one of the three slices. The other two stay untouched.
export async function autoAssignReports(
  reportType: ReportType,
): Promise<JuryAssignment[]> {
  const [jurors, teams, existing] = await Promise.all([
    sortedJurors(),
    sortedTeams(),
    getJuryAssignments(),
  ]);
  validateJurorCount(jurors.length);

  const otherType: ReportType =
    reportType === "intermediaire" ? "final" : "intermediaire";
  const existingOther = existing.filter((a) => a.reportType === otherType);

  const fresh = computeReportAssignments(
    jurors,
    teams,
    reportType,
    existingOther,
  );

  await saveJuryAssignments([...existingOther, ...fresh]);
  return fresh;
}

export async function autoAssignPassages(): Promise<JuryPassageAssignment[]> {
  const [jurors, passages] = await Promise.all([sortedJurors(), sortedPassages()]);
  validateJurorCount(jurors.length);

  const fresh = computePassageAssignments(jurors, passages);
  await saveJuryPassageAssignments(fresh);
  return fresh;
}

// ─── Algorithms ────────────────────────────────────────────────────────

// Round-robin distribution of teams to jurors. When `avoidPair` is
// passed (the assignments of the *other* report type), we prefer slots
// that don't collide with the other type's juror for the same team.
//
// Strategy: lay teams on a ring, walk jurors in order; if the natural
// juror clashes with the avoidance set for that team, rotate the juror
// pointer until a non-clash slot is found. Because |jurors| ≥ 2, a
// non-clash slot always exists for each team (the avoidance set has at
// most one entry per team).
function computeReportAssignments(
  jurors: JuryMember[],
  teams: Team[],
  reportType: ReportType,
  avoidPair: JuryAssignment[] = [],
): JuryAssignment[] {
  const juryIds = jurors.map((j) => j.id);
  const teamIds = teams.map((t) => t.id);

  let out = assignJuryEquitably(juryIds, teamIds, reportType);

  if (avoidPair.length > 0) {
    const blocked = new Map<string, string>();
    for (const a of avoidPair) blocked.set(a.teamId, a.juryMemberId);
    out = minimizeReportCollisions(out, blocked);
  }

  return out;
}

function assignJuryEquitably(
  juryIds: string[],
  teamIds: string[],
  reportType: ReportType,
): JuryAssignment[] {
  const shuffledTeams = shuffle([...teamIds]);
  const assignments: JuryAssignment[] = [];
  const J = juryIds.length;

  shuffledTeams.forEach((teamId, i) => {
    const juryMemberId = juryIds[i % J];
    assignments.push({ juryMemberId, teamId, reportType });
  });

  return assignments;
}

function minimizeReportCollisions(
  assignments: JuryAssignment[],
  blocked: Map<string, string>,
): JuryAssignment[] {
  const out = assignments.map((a) => ({ ...a }));

  for (let i = 0; i < out.length; i++) {
    const current = out[i];
    const blockedJuror = blocked.get(current.teamId);
    if (!blockedJuror || current.juryMemberId !== blockedJuror) continue;

    for (let j = i + 1; j < out.length; j++) {
      const candidate = out[j];
      const candidateBlocked = blocked.get(candidate.teamId);
      if (candidate.juryMemberId === blockedJuror) continue;
      if (candidateBlocked && candidateBlocked === current.juryMemberId)
        continue;

      const tmp = current.juryMemberId;
      current.juryMemberId = candidate.juryMemberId;
      candidate.juryMemberId = tmp;
      break;
    }
  }

  return out;
}

// Each passage gets exactly `JURORS_PER_PASSAGE` jurors. We walk a
// global cursor over the juror ring so the total load is balanced
// across the panel; we also guarantee the two jurors of a given
// passage are distinct.
function computePassageAssignments(
  jurors: JuryMember[],
  passages: Passage[],
): JuryPassageAssignment[] {
  const J = jurors.length;
  const out: JuryPassageAssignment[] = [];
  let cursor = 0;
  for (const p of passages) {
    const assigned = new Set<string>();
    while (assigned.size < JURORS_PER_PASSAGE) {
      const juror = jurors[cursor % J];
      cursor++;
      if (assigned.has(juror.id)) continue; // skip duplicates (rare; only when J < passes per loop)
      assigned.add(juror.id);
      out.push({ juryMemberId: juror.id, passageId: p.id });
    }
  }
  return out;
}

// ─── Queries useful to the management page ────────────────────────────

// The backend computes per-juror workload directly — see getJurorLoads in
// juryRepository.ts (GET /api/jury/loads) — so there's nothing left to
// derive here.
export { getJurorLoads as computeJurorLoads };

// ─── Helpers ──────────────────────────────────────────────────────────

async function sortedJurors(): Promise<JuryMember[]> {
  const all = await getJuryMembers();
  return [...all].sort((a, b) => a.id.localeCompare(b.id));
}

async function sortedTeams(): Promise<Team[]> {
  const all = await getTeams();
  return [...all].sort((a, b) => a.id.localeCompare(b.id));
}

async function sortedPassages(): Promise<Passage[]> {
  const all = await getPassages();
  return [...all].sort((a, b) => a.label.localeCompare(b.label));
}

function validateJurorCount(n: number): void {
  if (n < 2) {
    throw new ConflictError(
      "Au moins deux membres du jury sont requis pour distribuer la charge (un même juré ne peut pas grader le RI et le RF d'une même équipe).",
    );
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
