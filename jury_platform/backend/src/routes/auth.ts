import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config";
import { db } from "../db";
import { authenticate, signToken } from "../middleware/auth";
import { audit } from "../services/audit";
import { accountToUser } from "../types";
import { generatePassword, hashPassword, verifyPassword } from "../utils/passwords";
import { asyncRoute, BadRequestError, UnauthorizedError } from "../utils/errors";

const router = Router();

// Keyed on the visitor's IP. In production Cloudflare then Caddy sit in
// front, so the socket address is a proxy's: CLIENT_IP_HEADER names the
// header holding the real one (cf-connecting-ip).
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => (config.clientIpHeader && req.get(config.clientIpHeader)) || req.ip || "unknown",
  message: { error: "Trop de tentatives, réessayez dans une minute" },
});

// Compared against when the email is unknown, so a failed login takes the
// same time whether or not the account exists.
const dummyHash = hashPassword(generatePassword());

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// POST /api/auth/login — { email, password } -> { token, user }
router.post("/login", loginLimiter, asyncRoute(async (req, res) => {
  const { email, password } = LoginSchema.parse(req.body);

  const account = await db.account.findUnique({ where: { email } });
  const ok = await verifyPassword(password, account?.passwordHash ?? (await dummyHash));
  if (!account || !ok) throw new UnauthorizedError("Email ou mot de passe incorrect");

  res.json({ token: await signToken(account.id), user: accountToUser(account) });
}));

// GET /api/auth/me
router.get("/me", authenticate, (req, res) => {
  res.json(req.user);
});

const PasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères"),
});

// PUT /api/auth/password — change your own password
router.put("/password", authenticate, asyncRoute(async (req, res) => {
  const { currentPassword, newPassword } = PasswordSchema.parse(req.body);

  const account = await db.account.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await verifyPassword(currentPassword, account.passwordHash))) {
    throw new BadRequestError("Mot de passe actuel incorrect");
  }

  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    await tx.account.update({ where: { id: account.id }, data: { passwordHash } });
    // The journal covers admin actions only
    if (account.role === "admin") {
      await audit(tx, req.user!, { category: "Comptes", action: "account.password", summary: "A changé son mot de passe" });
    }
  });
  res.status(204).send();
}));

export default router;
