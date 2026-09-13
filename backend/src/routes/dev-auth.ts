import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { issueDevLoginToken, resolveUserByEmail } from "../middleware/auth";
import { db } from "../db";
import { NotFoundError } from "../utils/errors";

const router = Router();

// Dev-only login stub: sign in as any already-seeded user by email, no
// password. Stands in for real login until that's decided — every route
// here 404s unless ENABLE_DEV_LOGIN=true.
router.use((_req, res, next) => {
  if (!config.enableDevLogin) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
});

// GET /api/auth/dev-login/users — list every seeded account, for a picker
router.get("/users", async (_req, res, next) => {
  try {
    const [participants, juryMembers, organizers] = await Promise.all([
      db.participant.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          team: { select: { name: true, quadrigramme: true } },
        },
      }),
      db.juryMember.findMany({
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      db.organizer.findMany({
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      }),
    ]);

    res.json([
      ...participants.map((p) => ({ ...p, role: "participant" as const })),
      ...juryMembers.map((j) => ({ ...j, role: "jury" as const })),
      ...organizers.map((o) => ({
        ...o,
        role: "organizer" as const,
        organizerRole: o.role,
      })),
    ]);
  } catch (err) { next(err); }
});

// POST /api/auth/dev-login — { email } -> { token, user }
router.post("/", async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);

    const user = await resolveUserByEmail(email);
    if (!user) throw new NotFoundError("No account with this email");

    const token = await issueDevLoginToken(email);
    res.json({ token, user });
  } catch (err) { next(err); }
});

export default router;
