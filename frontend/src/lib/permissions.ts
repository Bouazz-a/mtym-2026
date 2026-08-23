import type {
  Announcement,
  Deadline,
  Document,
  JuryAssignment,
  JuryMember,
  JuryPassageAssignment,
  Organizer,
  OralEvaluation,
  Participant,
  Passage,
  Pool,
  ReportEvaluation,
  ReportType,
  Team,
} from "@/types";

/**
 * Access control policy
 * RBAC-style functions returning booleans based on user role and other factors.
 *
 */

// ================== Role checks ==================

export function isAdmin(organizer: Organizer): boolean {
  return organizer.role === "admin";
}

export function isLogistics(organizer: Organizer): boolean {
  return organizer.role === "logistics";
}

export function isScientific(organizer: Organizer): boolean {
  return organizer.role === "scientific";
}

// ================== Teams ==================

export function isTeamCreator(participant: Participant, team: Team): boolean {
  return team.creatorId === participant.id;
}

export function isTeamMember(participant: Participant, team: Team): boolean {
  return participant.teamId === team.id;
}

// Only the admin can rename, reassign members, or change the quadrigramme.
export function canModifyTeam(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

// Organizer can reassign the team creeator role
export function canReassignTeamCreator(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

export function canDeleteTeam(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

export function canMoveParticipantBetweenTeams(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

// ================== Documents ==================

// Upload : team creator + admin override.
// Locked documents cannot be uploaded over.
export function canUploadDocumentAsParticipant(
  participant: Participant,
  team: Team,
  existing: Document | undefined,
): boolean {
  if (!isTeamCreator(participant, team)) return false;
  if (existing?.isLocked) return false;
  return true;
}

export function canUploadDocumentAsOrganizer(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

// View : team members (all of them, not just creator), assigned jury, organizers.
export function canViewDocumentAsParticipant(
  participant: Participant,
  document: Document,
  team: Team,
): boolean {
  return isTeamMember(participant, team) && document.teamId === team.id;
}

export function canViewDocumentAsJury(
  juryMember: JuryMember,
  document: Document,
  assignments: JuryAssignment[],
): boolean {
  return assignments.some(
    (a) => a.juryMemberId === juryMember.id && a.teamId === document.teamId,
  );
}

export function canViewDocumentAsOrganizer(_: Organizer): boolean {
  return true;
}

// ================== Jury remarks visibility ==================

// Participants see jury remarks only after the jury submission deadline has passed
export function canViewJuryRemarks(
  participant: Participant,
  team: Team,
  juryDeadlinePassed: boolean,
): boolean {
  return isTeamMember(participant, team) && juryDeadlinePassed;
}

// Participants never see numeric grades, only remarks.
export function canViewGrades(): false {
  return false;
}

// ================== Jury assignments & evaluations ==================

export function canJurorEvaluateReport(
  juryMember: JuryMember,
  team: Team,
  reportType: ReportType,
  assignments: JuryAssignment[],
): boolean {
  return assignments.some(
    (a) =>
      a.juryMemberId === juryMember.id &&
      a.teamId === team.id &&
      a.reportType === reportType,
  );
}

export function canJurorEvaluatePassage(
  juryMember: JuryMember,
  passage: Passage,
  assignments: JuryPassageAssignment[],
): boolean {
  return assignments.some(
    (a) => a.juryMemberId === juryMember.id && a.passageId === passage.id,
  );
}

// A juror sees only their own evaluations. Admin see all.
export function canViewEvaluationAsJuror(
  juryMember: JuryMember,
  evaluation: ReportEvaluation | OralEvaluation,
): boolean {
  return evaluation.juryMemberId === juryMember.id;
}

// Author can edit their own evaluation. Admin can edit any.
export function canEditEvaluationAsJuror(
  juryMember: JuryMember,
  evaluation: ReportEvaluation | OralEvaluation,
): boolean {
  return evaluation.juryMemberId === juryMember.id;
}

export function canEditEvaluationAsOrganizer(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

// Only admin can delete or restore evaluations (jurys edit, never delete).
export function canDeleteEvaluation(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

export function canRestoreEvaluation(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

// Creating/modifying the assignment tables (BDD 1 & 2). Done in-app.
export function canManageJuryAssignments(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

// ================== Pools & passages (BDD 3 & 4) ==================

export function canManagePoolsAndPassages(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

// Resolve the role a team plays in a given passage.
// Returns null if the team is not part of the passage.
export function getTeamRoleInPassage(
  team: Team,
  passage: Passage,
): "defender" | "opponent" | "reporter" | "extra" | null {
  if (passage.defenderTeamId === team.id) return "defender";
  if (passage.opponentTeamId === team.id) return "opponent";
  if (passage.reporterTeamId === team.id) return "reporter";
  if (passage.extraTeamId === team.id) return "extra";
  return null;
}

// A participant sees passages of their own pools only. The caller resolves
// the pool from the passage's poolId, and the team from the participant.
export function canViewPassageAsParticipant(
  participant: Participant,
  team: Team,
  passage: Passage,
  pool: Pool,
): boolean {
  if (!isTeamMember(participant, team)) return false;
  if (passage.poolId !== pool.id) return false;
  return pool.id === team.poolIdRound1 || pool.id === team.poolIdRound2;
}

// ================== Cross-team document access in a passage ==================

// Number of days before a passage during which opponent/reporter/extra teams
// can start accessing the defender's final report.
const REPORT_VISIBILITY_DAYS_BEFORE_PASSAGE = 14;

// True if the passage is within the visibility window (≤ N days away or in the past).
// Returns false if passage.day is missing or not a valid DD-MM-YYYY string.
function isPassageWithinReportVisibilityWindow(passage: Passage): boolean {
  if (!passage.day) return false;
  const match = passage.day.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return false;
  const [, dd, mm, yyyy] = match.map(Number);
  const passageDate = new Date(yyyy, mm - 1, dd).getTime();
  const cutoff =
    passageDate - REPORT_VISIBILITY_DAYS_BEFORE_PASSAGE * 24 * 60 * 60 * 1000;
  return Date.now() >= cutoff;
}

// All members of the opponent, reporter, and extra teams in a passage
// can download the defender's final report on the problem being defended,
// starting REPORT_VISIBILITY_DAYS_BEFORE_PASSAGE days before the passage.
// (The defender's own team always has access via canViewDocumentAsParticipant.)
export function canDownloadDefenderReportInPassage(
  participant: Participant,
  viewerTeam: Team,
  passage: Passage,
  document: Document,
): boolean {
  if (!isTeamMember(participant, viewerTeam)) return false;
  if (document.teamId !== passage.defenderTeamId) return false;

  const expectedDocType = `rapport_final_p${passage.problemNumber}` as const;
  if (document.docType !== expectedDocType) return false;

  const role = getTeamRoleInPassage(viewerTeam, passage);
  if (role !== "opponent" && role !== "reporter" && role !== "extra")
    return false;

  return isPassageWithinReportVisibilityWindow(passage);
}

// Opponent and reporter teams of a passage can download the summary sheet
// template (same template for both). The defender doesn't write one.
export function canDownloadSummarySheetTemplateInPassage(
  participant: Participant,
  viewerTeam: Team,
  passage: Passage,
): boolean {
  if (!isTeamMember(participant, viewerTeam)) return false;
  const role = getTeamRoleInPassage(viewerTeam, passage);
  return role === "opponent" || role === "reporter";
}

// Summary sheets themselves (the documents written by opponent/reporter teams)
// are visible ONLY to jury members. Other teams in the passage cannot see them.
export function canViewSummarySheetAsJury(
  juryMember: JuryMember,
  document: Document,
  passage: Passage,
  passageAssignments: JuryPassageAssignment[],
): boolean {
  const isFicheSynthese = document.docType.startsWith("fiche_synthese_");
  if (!isFicheSynthese) return false;
  return passageAssignments.some(
    (a) => a.juryMemberId === juryMember.id && a.passageId === passage.id,
  );
}

// ================== Announcements ==================

// Admin only , create/modify/delete announcements.
export function canManageAnnouncements(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

// Audience-based visibility. Organizers see everything.
export function canViewAnnouncementAsParticipant(
  announcement: Announcement,
): boolean {
  return (
    announcement.audience === "all" || announcement.audience === "participants"
  );
}

export function canViewAnnouncementAsJury(announcement: Announcement): boolean {
  return announcement.audience === "all" || announcement.audience === "jury";
}

export function canViewAnnouncementAsOrganizer(_: Organizer): boolean {
  return true;
}

// ================== Deadlines ==================

// All organizers can create/edit deadlines.
export function canManageDeadlines(organizer: Organizer): boolean {
  return (
    isAdmin(organizer) || isLogistics(organizer) || isScientific(organizer)
  );
}

// Locking/unlocking a deadline (and the documents it governs) is admin only.
export function canLockDeadline(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

export function canUnlockDeadline(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

// Deadlines target an Audience, visibility follows the same logic as announcements.
export function canViewDeadlineAsParticipant(deadline: Deadline): boolean {
  return (
    deadline.targetRole === "all" || deadline.targetRole === "participants"
  );
}

export function canViewDeadlineAsJury(deadline: Deadline): boolean {
  return deadline.targetRole === "all" || deadline.targetRole === "jury";
}

// ================== Criteria ==================

// Admin and scientific organizers manage the evaluation criteria (the
// grading grid for reports and oral passages) and their coefficients.
export function canManageCriteria(organizer: Organizer): boolean {
  return isAdmin(organizer) || isScientific(organizer);
}

// ================== Evaluation review ==================

// Admin and scientific organizers may review jury evaluations — the
// numeric grades and the per-team / per-juror remarks. Logistics may not.
export function canViewEvaluations(organizer: Organizer): boolean {
  return isAdmin(organizer) || isScientific(organizer);
}

// ================== Participant info ==================

// A participant sees only their own profile. No coéquipier visibility.
export function canViewParticipantInfoAsParticipant(
  viewer: Participant,
  target: Participant,
): boolean {
  return viewer.id === target.id;
}

// Jurys see team members' names only (the caller exposes a redacted projection;
// here we only authorize the name+role view, not contact info).
export function canViewParticipantNameAsJury(
  juryMember: JuryMember,
  participant: Participant,
  assignments: JuryAssignment[],
): boolean {
  return assignments.some(
    (a) => a.juryMemberId === juryMember.id && a.teamId === participant.teamId,
  );
}

// Edit personal info : the participant themselves, or admin.
export function canEditParticipantInfoAsParticipant(
  viewer: Participant,
  target: Participant,
): boolean {
  return viewer.id === target.id;
}

export function canEditParticipantInfoAsOrganizer(
  organizer: Organizer,
): boolean {
  return isAdmin(organizer);
}

// Health info , more restrictive : participant + admin only
export function canViewHealthInfoAsParticipant(
  viewer: Participant,
  target: Participant,
): boolean {
  return viewer.id === target.id;
}

export function canViewHealthInfoAsOrganizer(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

export function canEditHealthInfoAsParticipant(
  viewer: Participant,
  target: Participant,
): boolean {
  return viewer.id === target.id;
}

export function canEditHealthInfoAsOrganizer(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

// ================== Workshops ==================

// Edit workshop preferences : participant + admin
export function canEditWorkshopPreferencesAsParticipant(
  viewer: Participant,
  target: Participant,
): boolean {
  return viewer.id === target.id;
}

export function canEditWorkshopPreferencesAsOrganizer(
  organizer: Organizer,
): boolean {
  return isAdmin(organizer) || isLogistics(organizer);
}

// ================== Cross-cutting team listings ==================

// Public listing : all teams (name + quadrigramme + members) visible to all.
// No function needed , the data is public. Helpers are listed here for
// documentation completeness; they always return true.
export function canViewTeamPublic(): true {
  return true;
}

// All jury members are visible to other jurors.
export function canViewJuryList(): true {
  return true;
}

// ================== Account management ==================

// Admin manually creates organizer and jury accounts.
export function canCreateOrganizerAccount(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

export function canCreateJuryAccount(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

// Deleting user accounts , admin only across the board.
export function canDeleteParticipant(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

export function canDeleteJuryMember(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

export function canDeleteOrganizer(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

export function canChangeOrganizerRole(): false {
  return false;
}

// Admin can impersonate any user (for debugging / support).
export function canImpersonate(organizer: Organizer): boolean {
  return isAdmin(organizer);
}

// ================== Workshop assignments ==================

// Workshop assignments are produced by an algorithm; admin has the last word.
export function canManageWorkshopAssignments(organizer: Organizer): boolean {
  return isAdmin(organizer);
}
