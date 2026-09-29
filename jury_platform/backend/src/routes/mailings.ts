import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { adminOnly } from "../middleware/auth";
import { audit } from "../services/audit";
import { sendMail, mailConfigured } from "../services/mailer";
import { recipientsOf } from "../services/convocation";
import { composeConvocation, logoAttachment, withInlineLogo } from "../services/mailings";
import { asyncRoute, BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

// Convocation emails to the teams — mounted under /api/mailings, admins
// only. One team per request (the page loops over a day), so sending a
// whole day never runs into a request timeout.
const router = Router();
router.use(...adminOnly);

type Status = "never" | "sent" | "outdated";

// GET /api/mailings?centerDayId= — each team of the day: its recipients,
// its problems per role, missing reports, and whether it was sent (again
// needed when the day's draw was validated after the send)
router.get("/", asyncRoute(async (req, res) => {
  const centerDayId = z.string().uuid().parse(req.query.centerDayId);
  const day = await db.centerDay.findUnique({ where: { id: centerDayId } });
  if (!day) throw new NotFoundError("Center day not found");

  const teams = await db.team.findMany({
    where: { centerDayId },
    include: { contacts: true, mailings: { orderBy: { sentAt: "desc" }, take: 1 } },
    orderBy: { quadrigram: "asc" },
  });
  const passages = await db.passage.findMany({ where: { pool: { centerDayId } } });
  const reports = await db.teamReport.findMany({
    where: { teamId: { in: teams.map((t) => t.id) } },
    select: { teamId: true, problemNumber: true },
  });
  const hasReport = new Set(reports.map((r) => `${r.teamId}:${r.problemNumber}`));
  const quad = new Map(teams.map((t) => [t.id, t.quadrigram]));

  res.json({
    mailConfigured: mailConfigured(),
    drawValidated: Boolean(day.drawValidatedAt),
    teams: teams.map((t) => {
      const defense = passages.find((p) => p.defenderTeamId === t.id);
      const opposition = passages.find((p) => p.opponentTeamId === t.id);
      const report = passages.find((p) => p.reporterTeamId === t.id);
      const against = (p: typeof opposition) =>
        p && { problem: p.problemNumber, defender: quad.get(p.defenderTeamId) ?? "?", reportFiled: hasReport.has(`${p.defenderTeamId}:${p.problemNumber}`) };
      const last = t.mailings[0];
      const status: Status = !last
        ? "never"
        : !day.drawValidatedAt || last.sentAt < day.drawValidatedAt ? "outdated" : "sent";
      return {
        teamId: t.id,
        quadrigram: t.quadrigram,
        name: t.name,
        members: (t.members as unknown[]).length,
        recipients: recipientsOf(t.contacts).length,
        inPool: Boolean(defense),
        defense: defense ? { problem: defense.problemNumber } : null,
        opposition: against(opposition) ?? null,
        report: against(report) ?? null,
        status,
        sentAt: last?.sentAt ?? null,
        sentBy: last?.sentBy ?? null,
      };
    }),
  });
}));

// GET /api/mailings/:teamId/preview — the email as it will be sent
router.get("/:teamId/preview", asyncRoute(async (req, res) => {
  const c = await composeConvocation(req.params.teamId, false);
  res.json({ to: c.to, subject: c.subject, html: withInlineLogo(c.html), attachments: c.attachmentInfo });
}));

// POST /api/mailings/:teamId/send — { test, to }: a test goes to `to`, or
// the admin by default ("[TEST]", not recorded); a real send to every member
// with an email (`to` ignored), once the day's draw is validated
router.post("/:teamId/send", asyncRoute(async (req, res) => {
  const body = z.object({ test: z.boolean().optional(), to: z.string().optional() }).parse(req.body ?? {});
  const test = body.test ?? false;
  const testTo = body.to?.trim().toLowerCase() || undefined;
  if (test && testTo && !z.string().email().safeParse(testTo).success) {
    throw new BadRequestError(`Adresse de test invalide : « ${testTo} »`);
  }
  const team = await db.team.findUnique({ where: { id: req.params.teamId }, include: { centerDay: true } });
  if (!team) throw new NotFoundError("Équipe introuvable");
  if (!test && !team.centerDay?.drawValidatedAt) {
    throw new ConflictError("Validez d'abord le tirage de ce jour : les convocations partent quand les poules ne bougent plus");
  }

  const c = await composeConvocation(team.id, true);
  const to = test ? [testTo ?? req.user!.email] : c.to;
  if (to.length === 0) throw new BadRequestError(`Aucun membre de ${team.quadrigram} n'a d'adresse email`);
  await sendMail({
    to,
    subject: test ? `[TEST] ${c.subject}` : c.subject,
    html: c.html,
    text: c.text,
    attachments: [logoAttachment(), ...c.files],
  });

  if (!test) {
    const sentBy = `${req.user!.firstName} ${req.user!.lastName}`;
    await db.$transaction(async (tx) => {
      await tx.teamMailing.create({ data: { teamId: team.id, sentBy, recipients: to } });
      await audit(tx, req.user!, {
        category: "Convocations",
        action: "mail.send",
        summary: `Convocation envoyée à ${team.quadrigram} (${to.length} destinataire${to.length > 1 ? "s" : ""})`,
        details: { "pièces jointes": c.files.map((f) => f.filename) },
      });
    });
  }
  res.json({ test, sentTo: to, attachments: c.attachmentInfo });
}));

export default router;
