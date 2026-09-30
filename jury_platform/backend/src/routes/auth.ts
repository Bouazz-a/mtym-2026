import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config";
import { db } from "../db";
import { authenticate, signToken } from "../middleware/auth";
import { hashResetToken, sendResetLink } from "../services/accountMail";
import { audit } from "../services/audit";
import { accountToUser } from "../types";
import { generatePassword, hashPassword, verifyPassword } from "../utils/passwords";
import { asyncRoute, BadRequestError, UnauthorizedError } from "../utils/errors";

const router = Router();

// Keyed on the visitor's IP. In production Cloudflare then Caddy sit in
// front, so the socket address is a proxy's: CLIENT_IP_HEADER names the
// header holding the real one (cf-connecting-ip).
const clientIp = (req: Request) => (config.clientIpHeader && req.get(config.clientIpHeader)) || req.ip || "unknown";

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: clientIp,
  message: { error: "Trop de tentatives, réessayez dans une minute" },
});

// « Mot de passe oublié »: asking for links, and using them. Loose enough
// for a room of jurors behind one venue's Wi-Fi (one IP); each inbox is
// protected on its own by the two minutes between links (accountMail.ts),
// and a link's 256-bit token can't be guessed.
const resetLimiter = (limit: number) => rateLimit({
  windowMs: 10 * 60 * 1000,
  limit,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: clientIp,
  message: { error: "Trop de demandes, réessayez dans quelques minutes" },
});
const forgotLimiter = resetLimiter(10);
const linkLimiter = resetLimiter(20);

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

const NewPassword = z.string().min(8, "Le mot de passe doit faire au moins 8 caractères");

const PasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: NewPassword,
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

// POST /api/auth/forgot-password — { email } -> 204, always and at once:
// whether an account has this address can't be told from the answer, nor
// from its timing (the email is sent after the answer). services/
// accountMail.ts decides whether a link goes out.
router.post("/forgot-password", forgotLimiter, asyncRoute(async (req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
  res.status(204).send();
  sendResetLink(email).catch((err) => console.error("[forgot-password]", (err as Error).message));
}));

// POST /api/auth/reset-password — { token, newPassword } -> { token, user }
// The link's token sets a new password, once, within the hour; the account
// is then logged in.
router.post("/reset-password", linkLimiter, asyncRoute(async (req, res) => {
  const { token, newPassword } = z.object({ token: z.string().min(1), newPassword: NewPassword }).parse(req.body);

  const link = await db.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token) }, include: { account: true } });
  if (!link || link.usedAt || link.expiresAt < new Date()) {
    throw new BadRequestError("Ce lien n'est plus valable : demandez-en un nouveau");
  }
  const { account } = link;
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    await tx.account.update({ where: { id: account.id }, data: { passwordHash } });
    await tx.passwordResetToken.update({ where: { id: link.id }, data: { usedAt: new Date() } });
    // Any other link of the account stops working too
    await tx.passwordResetToken.deleteMany({ where: { accountId: account.id, id: { not: link.id } } });
    // The journal covers admin actions only
    if (account.role === "admin") {
      await audit(tx, accountToUser(account), {
        category: "Comptes",
        action: "account.password",
        summary: "A réinitialisé son mot de passe (lien « Mot de passe oublié »)",
      });
    }
  });
  res.json({ token: await signToken(account.id), user: accountToUser(account) });
}));

export default router;
