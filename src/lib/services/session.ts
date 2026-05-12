import type { JuryMember, Organizer, Participant, Team } from "@/types";

/**
 * Currently authenticated user, passed explicitly to services.
 */

export type Session = ParticipantSession | JurySession | OrganizerSession;

export interface ParticipantSession {
  role: "participant";
  participant: Participant;
  team: Team;
}

export interface JurySession {
  role: "jury";
  juryMember: JuryMember;
}

export interface OrganizerSession {
  role: "organizer";
  organizer: Organizer;
}

// ================== Type guards ==================

export function isParticipantSession(
  session: Session,
): session is ParticipantSession {
  return session.role === "participant";
}

export function isJurySession(session: Session): session is JurySession {
  return session.role === "jury";
}

export function isOrganizerSession(
  session: Session,
): session is OrganizerSession {
  return session.role === "organizer";
}
