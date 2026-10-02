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
  isJuror: boolean; // judges (duos, grading, reports): every jury account, and some admins
}

export interface Account extends AuthUser {
  phone: string | null;
  createdAt: string;
  credentialsSentAt: string | null; // when a password was last emailed to it
}

// How a juror appears in a duo
export type Juror = Pick<Account, "id" | "firstName" | "lastName" | "email">;

// Two jurors who judge together for a whole center day; each passage of
// that day gets one duo.
export interface JuryDuo {
  id: string;
  centerDayId: string;
  number: number; // "Duo 1", "Duo 2"… within the day
  problemNumber: number | null; // its jurors specialize in it (report assignment)
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
  presentations: { id: string; problemNumber: number }[]; // what it shows when it defends that problem
  problemRanking: number[]; // the problems it wants to defend, favorite first; empty = none given
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

// What validating a day does to its reports already handed out to jurors,
// after its pools changed (backend/src/services/reportValidation.ts)
export interface ReportChange {
  reportId: string;
  team: string; // quadrigram
  problemNumber: number;
  juror: string;
}

export interface ValidationImpact {
  removed: (ReportChange & { graded: boolean; reason: "defended" | "withoutPool" })[];
  assigned: ReportChange[];
  unassigned: Omit<ReportChange, "juror">[]; // no juror has a problem yet
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
  description?: string | null; // what it looks at: shown to jurors on hover/click of its title
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

// One per juror × team × problem: the defender's report (graded by the
// passage's duo), or a report handed to the juror (Affectation des rapports)
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
  // The written-report note is the weighted average of the team's reports
  // (each out of 20): each problem's weight in %, keyed "1".."4", adding up to 100
  problemWeights: Record<string, number>;
}

// ================== Report assignment ==================

// A report of a problem its team doesn't defend, handed to one juror to
// correct (the defended one is graded by the duo of its passage)
export interface AssignableReport {
  id: string; // the TeamReport
  teamId: string;
  problemNumber: number;
  accountId: string | null; // the juror correcting it
  graded: boolean; // that juror has saved a grade: it can't move any more
}

export interface ReportAssignmentBoard {
  reports: AssignableReport[];
  pendingDays: { id: string; center: Center; date: string }[]; // draw not validated: teams wait
  jurors: { id: string; problems: number[] }[]; // every juror's specialties (their duos' problems)
}

// "Mes rapports": a report handed to the juror
export interface MyReport {
  reportId: string;
  teamId: string;
  problemNumber: number;
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

// ================== Convocations ==================

// A role the team plays against another team's defense
export interface MailingRole {
  problem: number;
  defender: string; // the defending team's quadrigram
  reportFiled: boolean; // its report exists, so it goes with the email
}

// "never" sent; "sent"; "outdated": the day's draw was validated again since
export type MailingStatus = "never" | "sent" | "outdated";

export interface TeamMailingRow {
  teamId: string;
  quadrigram: string;
  name: string;
  members: number;
  recipients: number; // members with an email
  inPool: boolean;
  pool: string | null; // its pool's label, "CAS-A1"
  defense: { problem: number } | null;
  opposition: MailingRole | null;
  report: MailingRole | null;
  status: MailingStatus;
  sentAt: string | null;
  sentBy: string | null;
}

export interface MailingBoard {
  mailConfigured: boolean; // SMTP (or the local outbox) set on the server
  drawValidated: boolean; // real sends wait for it
  teams: TeamMailingRow[];
}

export interface MailingAttachment {
  name: string;
  size: number | null; // bytes; null when unknown
  state: "attached" | "missing" | "tooLarge";
  error?: string;
}

// The admin's words in the convocation email, with {variables} filled in
// per team (backend/src/services/convocation.ts); the rest is generated
export interface MailTemplate {
  subject: string;
  title: string;
  intro: string; // the opening, up to the day's details; paragraphs split by a blank line
}

export interface MailTemplateInfo {
  template: MailTemplate;
  defaults: MailTemplate;
  variables: Record<string, string>; // name -> what it becomes
  updatedAt: string | null; // null: the defaults
  updatedBy: string | null;
}

export interface MailingPreview {
  to: string[];
  subject: string;
  html: string;
  attachments: MailingAttachment[];
}
