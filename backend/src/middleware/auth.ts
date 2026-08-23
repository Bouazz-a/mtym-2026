import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "../db";
import { config } from "../config";
import {
  participantToUser,
  juryMemberToUser,
  organizerToUser,
} from "../types";
import type { UserRole } from "../types";

// Cached JWKS — jose re-fetches automatically when keys rotate
const JWKS = createRemoteJWKSet(
  new URL(`${config.authentikIssuer}.well-known/jwks.json`),
);

async function resolveUserByEmail(email: string) {
  const participant = await db.participant.findUnique({ where: { email } });
  if (participant) return participantToUser(participant);

  const juryMember = await db.juryMember.findUnique({ where: { email } });
  if (juryMember) return juryMemberToUser(juryMember);

  const organizer = await db.organizer.findUnique({ where: { email } });
  if (organizer) return organizerToUser(organizer);

  return null;
}

// Validates the Authentik JWT and attaches req.user
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }
  try {
    const token = auth.slice(7);
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: config.authentikIssuer,
      audience: config.authentikAudience,
    });

    const email = payload.email as string | undefined;
    if (!email) {
      res.status(401).json({ error: "Token missing email claim" });
      return;
    }

    const user = await resolveUserByEmail(email);
    if (!user) {
      res.status(401).json({ error: "User not registered in the platform" });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Role guard factory — use after authenticate
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }
    next();
  };
}

// Organizer sub-role guard — use after requireRole("organizer")
export function requireOrganizerRole(
  ...orgRoles: Array<"admin" | "logistics" | "scientific">
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.organizerRole;
    if (!role || !orgRoles.includes(role)) {
      res.status(403).json({ error: "Insufficient organizer role" });
      return;
    }
    next();
  };
}
