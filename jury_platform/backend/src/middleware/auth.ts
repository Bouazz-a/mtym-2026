import type { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { db } from "../db";
import { config } from "../config";
import { accountToUser } from "../types";

const ISSUER = "mtym-jury";
const TOKEN_TTL = "12h";
const secret = new TextEncoder().encode(config.jwtSecret);

export function signToken(accountId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(accountId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secret);
}

// Validates the Bearer token and attaches req.user. The account is re-read
// on every request, so a deleted account or changed role takes effect
// immediately rather than when the token expires.
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

  let accountId: string | undefined;
  try {
    const { payload } = await jwtVerify(auth.slice(7), secret, {
      issuer: ISSUER,
      algorithms: ["HS256"],
    });
    accountId = payload.sub;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  try {
    const account = accountId
      ? await db.account.findUnique({ where: { id: accountId } })
      : null;
    if (!account) {
      res.status(401).json({ error: "Account no longer exists" });
      return;
    }
    req.user = accountToUser(account);
    next();
  } catch (err) {
    next(err);
  }
}

// Role guard factory — use after authenticate
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }
    next();
  };
}

export const adminOnly = [authenticate, requireRole("admin")];
