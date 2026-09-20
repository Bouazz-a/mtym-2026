// Shapes returned by the jury platform API (jury_platform/backend).

export type Role = "admin" | "jury";
export type Center =
  | "casablanca"
  | "rabat"
  | "martil"
  | "benguerir"
  | "agadir"
  | "fez"
  | "oujda"
  | "online";
export type PassageRole = "defender" | "opponent" | "reporter" | "extra";
export type EvaluationType = "report" | "oral";
export type Round = 1 | 2; // qualifs are round 1; round 2 only exists in the finale

// ================== Accounts ==================

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

export interface Account extends AuthUser {
  phone: string | null;
  createdAt: string;
}

// How a juror appears in a duo
export type Juror = Pick<Account, "id" | "firstName" | "lastName" | "email">;

// Two jurors who judge together for a whole center day; each passage of
// that day gets one duo.
export interface JuryDuo {
  id: string;
  centerDayId: string;
  number: number; // "Duo 1", "Duo 2"… within the day
  members: Juror[];
}

// ================== Teams ==================

export interface TeamMember {
  firstName: string;
  lastName: string;
}

export interface Team {
  id: string;
  sourceId: number; // team id on the main site
  name: string;
  quadrigram: string;
  center: Center;
  members: TeamMember[];
  centerDayId: string | null;
  reports: { id: string; problemNumber: number }[]; // FINAL reports submitted
}

// Slot n of a day holds passage n of every pool (the pools play in parallel)
export interface ScheduleSlot {
  start: string; // "HH:MM"
  minutes: number;
}

export interface CenterDay {
  id: string;
  center: Center;
  date: string; // "YYYY-MM-DD"
  schedule: ScheduleSlot[]; // 4 slots
  // The day's composition is settled. Teams may be left without a pool (a
  // team that doesn't come: its pool mates move to the online tournament,
  // by hand). Any change to the pools clears it.
  drawValidatedAt?: string | null;
  drawValidatedBy?: string | null; // the admin's name at that moment
  _count: { teams: number; pools: number };
}

// ================== Tournament ==================

export interface Pool {
  id: string;
  label: string;
  round: Round;
  centerDayId?: string | null; // null only for future finale pools
  // Set while the pool is being composed by hand and still has holes; its
  // passages only exist once the grid is complete (and `draft` goes back to
  // null). Admins only — a juror never sees a pool without passages.
  draft?: PoolGrid | null;
}

// A pool's grid as the admin fills it: one row per passage, a team (or not
// yet) per role.
export interface PoolGrid {
  size: 3 | 4;
  passages: GridPassage[];
}

export interface GridPassage {
  slot: number; // 1..size
  problemNumber: number; // 1..4
  defenderTeamId: string | null;
  opponentTeamId: string | null;
  reporterTeamId: string | null;
  extraTeamId: string | null; // pools of 4 only
  room: string | null;
}

export interface Passage {
  id: string;
  label: string;
  problemNumber: number; // 1..4
  poolId: string;
  defenderTeamId: string;
  opponentTeamId: string;
  reporterTeamId: string;
  extraTeamId?: string | null; // observer — pools of 4 only
  slot: number; // 1..4 — its time is the day's schedule[slot - 1]
  room?: string | null;
}

// A passage as returned by the API, with its judging duo
export interface PassageDetails extends Passage {
  duo: JuryDuo | null;
}

// GET /api/pools
export interface PoolDetails extends Pool {
  centerDay: Omit<CenterDay, "_count"> | null;
  passages: PassageDetails[];
}

// ================== Grading ==================

export interface Criterion {
  id: string;
  label: string;
  coefficient: number; // may be negative (malus)
  type: EvaluationType;
  role?: PassageRole | null; // oral only
  problemNumber?: number | null; // report only — 1..4
  theme?: string | null; // grouping label, e.g. "Débat", "Malus"
  order: number;
}

// Grades are success rates in 0..1; a criterion's note is score × coefficient.
export interface Grade {
  id: string;
  criterionId: string;
  score: number;
  remark: string | null;
}

// One per juror × passage × graded team (defender, opponent, reporter)
export interface OralEvaluation {
  id: string;
  juryId: string;
  passageId: string;
  teamId: string;
  role: PassageRole;
  globalRemark: string | null;
  grades: Grade[];
}

// One per juror × team × defended problem (the defender's report)
export interface ReportEvaluation {
  id: string;
  juryId: string;
  teamId: string;
  problemNumber: number;
  globalRemark: string | null;
  grades: Grade[];
}

// A team's final grade = Σ weight × note (each note as % of its grid) / Σ weights
export interface FinalWeights {
  defender: number;
  opponent: number;
  reporter: number;
  report: number;
}

// ================== Journal ==================

export interface AuditEntry {
  id: string;
  at: string; // ISO date
  actorId: string | null; // null once the account is deleted
  actorName: string;
  actorEmail: string;
  category: string;
  action: string;
  summary: string;
  details: unknown;
}
