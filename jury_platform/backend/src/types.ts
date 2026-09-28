import type { Account, Role } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isJuror: boolean; // judges — every jury account, and some admins
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function accountToUser(a: Account): AuthenticatedUser {
  return {
    id: a.id,
    email: a.email,
    firstName: a.firstName,
    lastName: a.lastName,
    role: a.role,
    isJuror: a.isJuror,
  };
}

// Every column except the password hash — what account routes return.
export const publicAccountSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isJuror: true,
  createdAt: true,
} as const;
