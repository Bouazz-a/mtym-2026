import type { Organizer, Participant, JuryMember } from "@prisma/client";

export type UserRole = "participant" | "jury" | "organizer";

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  // Participant-specific
  teamId?: string;
  // Organizer-specific
  organizerRole?: "admin" | "logistics" | "scientific";
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Helper to map DB rows to AuthenticatedUser
export function participantToUser(p: Participant): AuthenticatedUser {
  return {
    id: p.id,
    email: p.email,
    firstName: p.firstName,
    lastName: p.lastName,
    role: "participant",
    teamId: p.teamId,
  };
}

export function juryMemberToUser(j: JuryMember): AuthenticatedUser {
  return {
    id: j.id,
    email: j.email,
    firstName: j.firstName,
    lastName: j.lastName,
    role: "jury",
  };
}

export function organizerToUser(o: Organizer): AuthenticatedUser {
  return {
    id: o.id,
    email: o.email,
    firstName: o.firstName,
    lastName: o.lastName,
    role: "organizer",
    organizerRole: o.role,
  };
}
