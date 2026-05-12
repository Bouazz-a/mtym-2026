// Enums & primitives
export type Audience = "all" | "participants" | "jury";
export type ReportType = "intermediaire" | "final";
export type PassageRole = "defender" | "opponent" | "reporter" | "extra";
export type HoodieSize = "S" | "M" | "L" | "XL" | "XXL";
export type SchoolLevel = "3AC" | "TC" | "1BAC" | "2BAC";
export type OrganizerRole = "admin" | "logistics" | "scientific";
export type DocumentType =
  | "rapport_intermediaire"
  | "rapport_final_p1"
  | "rapport_final_p2"
  | "rapport_final_p3"
  | "rapport_final_p4"
  | "fiche_synthese_opposant_1"
  | "fiche_synthese_rapporteur_1"
  | "fiche_synthese_opposant_2"
  | "fiche_synthese_rapporteur_2"
  | "presentation_1"
  | "presentation_2";

export type Round = 1 | 2;
export type UserRole = "participant" | "jury" | "organizer";
export type TransportMode = "train" | "voiture" | "bus" | "autre";
export type EvaluationType = "report" | "oral";

// ================== Users ==================

export interface Participant {
  id: string; //uuid
  teamId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  city?: string;
  region?: string;
  birthDate?: string; // "DD-MM-YYYY"
  schoolLevel?: SchoolLevel;
  hoodieSize?: HoodieSize;
  healthInfo?: Record<string, string>;
  transportInfo?: TransportMode;
  roommatePrefs?: string; //participantId of preferred roommate, can be empty if no preference
}

export interface Organizer {
  id: string; //uuid
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: OrganizerRole;
}

export interface JuryMember {
  id: string; //uuid
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  city?: string;
  region?: string;
  transportInfo?: TransportMode;
}

// ================== Teams =================

export interface Team {
  id: string; //uuid
  name: string;
  quadrigramme: string; //unique 4-letter code
  creatorId: string; //participant id
  poolIdRound1: string; //pool id for round 1
  poolIdRound2?: string; //pool id for round 2, if qualified
}

// ================== Tournament Structure =================

export interface Pool {
  id: string; // uuid
  label: string; // e.g A1 for round 1, B1 for round 2
  round: Round;
}

export interface Passage {
  id: string; // uuid
  label: string; // e.g A1P1 for round 1 passage 1 (max 4 "passages" per team per round)
  problemNumber: number; // 1 to 4
  poolId: string; // pool id
  defenderTeamId: string; // team id
  opponentTeamId: string; // team id
  reporterTeamId: string; // team id
  extraTeamId?: string; // team id, can be empty if only 3 teams in the pool
  day?: string; // "DD-MM-YYYY"
  timeSlot?: string; // "HH:MM"
  room?: string;
}

// ================== Documents =================
export interface Document {
  id: string; // uuid
  docType: DocumentType;
  uploadedById: string; // creator id
  teamId: string; // team id (if creator changes / desists, document still belongs to the team)
  originalName: string;
  renamedAs: string; // stored file name on server
  storagePath: string;
  size: number; // in bytes
  mimeType: string;
  uploadedAt: string; // timestamp
  isLocked: boolean; // becomes true after the organizer's deadline for that docType
}

// ================== Jury Assignements =================
export interface JuryAssignment {
  juryMemberId: string;
  teamId: string;
  reportType: ReportType;
}

export interface JuryPassageAssignment {
  juryMemberId: string;
  passageId: string;
}

// ================== Grading =================
export interface Criterion {
  id: string;
  label: string; // "Clarté et pédagogie", "Q1(a)", etc.
  coefficient: number;
  type: EvaluationType;
  role?: PassageRole; // oral only
  problemNumber?: number; // report only
  order: number; // order of display
}

// Report evaluation (1 per (juror × team × reportType × problem))
export interface ReportEvaluation {
  id: string;
  juryMemberId: string;
  teamId: string;
  reportType: ReportType;
  problemNumber: number;
  globalRemark?: string;
}

// 1 per (evaluation × criterion)
export interface ReportGrade {
  id: string;
  reportEvaluationId: string; // links to the ReportEvaluation
  criterionId: string; // links to the Criterion being evaluated
  score: number;
  remark?: string;
}

// Oral evaluation (1 per jury member per passage)
export interface OralEvaluation {
  id: string;
  juryMemberId: string;
  passageId: string;
  teamId: string; // team being evaluated
  role: PassageRole; // defender, opponent, or rapporteur
  globalRemark?: string;
}

export interface OralGrade {
  id: string;
  oralEvaluationId: string; // links to the OralEvaluation
  criterionId: string; // links to the Criterion being evaluated
  score: number;
  remark?: string;
}

// ================== Workshops =================

export interface Workshop {
  id: string; // uuid
  name: string;
  instructor: string;
  capacity: number;
  slot: string; // e.g. "Samedi 14:00"
  tags: string[];
}

export interface WorkshopPreference {
  participantId: string;
  choice1Id: string;
  choice2Id: string;
  choice3Id: string;
}

export interface WorkshopAssignment {
  participantId: string;
  workshopId: string;
}

// ================== Announcements & Deadlines =================

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  attachments: string[]; // file names or URLs
  createdBy: string; // Organizer ID
  createdAt: string; // timestamp
}

export interface Deadline {
  id: string;
  label: string;
  date: string;
  targetRole: Audience;
}

// For demo purposes only, in a real app this would be handled by an auth system / db and not stored in the app state
export interface AppState {
  // Users
  participants: Participant[];
  teams: Team[];
  juryMembers: JuryMember[];
  organizers: Organizer[];

  // Tournament
  pools: Pool[];
  passages: Passage[];

  // Documents
  documents: Document[];

  // Jury
  juryAssignments: JuryAssignment[];
  juryPassageAssignments: JuryPassageAssignment[];

  // Evaluation
  criteria: Criterion[];
  reportEvaluations: ReportEvaluation[];
  reportGrades: ReportGrade[];
  oralEvaluations: OralEvaluation[];
  oralGrades: OralGrade[];

  // Workshops
  workshops: Workshop[];
  workshopPreferences: WorkshopPreference[];
  workshopAssignments: WorkshopAssignment[];

  // Communication
  announcements: Announcement[];
  deadlines: Deadline[];

  currentUserId: string;
  currentUserRole: UserRole;
}
