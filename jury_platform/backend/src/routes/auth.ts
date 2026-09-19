import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db";
import { authenticate, signToken } from "../middleware/auth";
import { audit } from "../services/audit";
import { accountToUser } from "../types";
import { generatePassword, hashPassword, verifyPassword } from "../utils/passwords";
import { BadRequestError, UnauthorizedError } from "../utils/errors";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
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
router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    const account = await db.account.findUnique({ where: { email } });
    const ok = await verifyPassword(password, account?.passwordHash ?? (await dummyHash));
    if (!account || !ok) throw new UnauthorizedError("Email ou mot de passe incorrect");

    res.json({ token: await signToken(account.id), user: accountToUser(account) });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get("/me", authenticate, (req, res) => {
  res.json(req.user);
});

const PasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères"),
});

// PUT /api/auth/password — change your own password
router.put("/password", authenticate, async (req, res, next) => {
  try {
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
  } catch (err) { next(err); }
});

export default router;
