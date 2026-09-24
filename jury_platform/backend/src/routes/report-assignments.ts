import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { planReportAssignment } from "../algorithms/reportAssignment";
import { adminOnly, authenticate, requireRole } from "../middleware/auth";
import { audit } from "../services/audit";
import { jurorProblems, reportPool } from "../services/reportPool";
import { asyncRoute, BadRequestError, ConflictError } from "../utils/errors";

// The reports of problems a team doesn't defend, each handed to one juror
// to correct (services/reportPool.ts). The admin assigns them by hand or
// automatically (algorithms/reportAssignment.ts); jurors see theirs in
// "Mes rapports".
const router = Router();

// How the journal names reports and jurors: "BAKA P2", "Ines Uitest"
async function namer(reportIds: string[], accountIds: (string | null)[]) {
  const [reports, accounts] = await Promise.all([
    db.teamReport.findMany({ where: { id: { in: reportIds } }, include: { team: { select: { quadrigram: true } } } }),
    db.account.findMany({ where: { id: { in: accountIds.filter((id): id is string => id !== null) } } }),
  ]);
  const reportNames = new Map(reports.map((r) => [r.id, `${r.team.quadrigram} P${r.problemNumber}`]));
  const jurorNames = new Map(accounts.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));
  return {
    report: (id: string) => reportNames.get(id) ?? "?",
    juror: (id: string | null) => (id ? jurorNames.get(id) ?? "?" : "non attribué"),
  };
}

// GET /api/report-assignments — admin: the reports to hand out with their
// juror, every juror's problems, and the days still waiting for validation
router.get("/", ...adminOnly, asyncRoute(async (_req, res) => {
  const [pool, jurors] = await Promise.all([reportPool(), jurorProblems()]);
  res.json({ ...pool, jurors });
}));

// GET /api/report-assignments/mine — jury: the reports handed to them
router.get("/mine", authenticate, requireRole("jury"), asyncRoute(async (req, res) => {
  const assignments = await db.reportAssignment.findMany({
    where: { accountId: req.user!.id },
    include: { report: { select: { id: true, teamId: true, problemNumber: true } } },
  });
  res.json(assignments.map(({ report }) => ({ reportId: report.id, teamId: report.teamId, problemNumber: report.problemNumber })));
}));

// POST /api/report-assignments/auto — { mode }: "fill" hands out the
// reports without a juror, "replace" redoes everything; a report already
// corrected always keeps its juror. Only jurors with a problem take part.
router.post("/auto", ...adminOnly, asyncRoute(async (req, res) => {
  const { mode } = z.object({ mode: z.enum(["fill", "replace"]) }).parse(req.body);
  const [{ reports }, allJurors] = await Promise.all([reportPool(), jurorProblems()]);
  const jurors = allJurors.filter((j) => j.problems.length > 0);
  if (jurors.length === 0) {
    throw new BadRequestError("Donnez d'abord un problème aux duos (page Affectation du jury)");
  }

  const plan = planReportAssignment(
    reports.map((r) => ({ id: r.id, problemNumber: r.problemNumber, accountId: r.accountId, locked: r.graded })),
    jurors,
    mode,
  );

  const { changes } = plan;
  if (changes.length > 0) {
    const before = new Map(reports.map((r) => [r.id, r.accountId]));
    const name = await namer(changes.map((c) => c.reportId), [...changes.map((c) => c.accountId), ...before.values()]);
    await db.$transaction(async (tx) => {
      await tx.reportAssignment.deleteMany({ where: { reportId: { in: changes.map((c) => c.reportId) } } });
      await tx.reportAssignment.createMany({
        data: changes.flatMap((c) => (c.accountId ? [{ reportId: c.reportId, accountId: c.accountId }] : [])),
      });
      await audit(tx, req.user!, {
        category: "Rapports",
        action: "reports.auto",
        summary: `Attribution automatique des rapports (${mode === "fill" ? "compléter" : "tout refaire"}) : ${changes.length} rapport${changes.length > 1 ? "s" : ""} modifié${changes.length > 1 ? "s" : ""}`,
        details: {
          rapports: changes.map((c) => ({
            rapport: name.report(c.reportId),
            avant: name.juror(before.get(c.reportId) ?? null),
            après: name.juror(c.accountId),
          })),
        },
      });
    });
  }

  res.json({
    changed: changes.length,
    assigned: plan.assigned,
    unassigned: plan.unassigned,
    offSpecialty: plan.offSpecialty,
  });
}));

// PUT /api/report-assignments/:reportId — { accountId | null }: hand the
// report to a juror (any jury account), move it, or take it back
router.put("/:reportId", ...adminOnly, asyncRoute(async (req, res) => {
  const { accountId } = z.object({ accountId: z.string().uuid().nullable() }).parse(req.body);
  const { reports } = await reportPool();
  const report = reports.find((r) => r.id === req.params.reportId);
  if (!report) {
    throw new BadRequestError("Ce rapport n'est pas à attribuer : c'est celui du problème défendu, ou le tirage de son jour n'est pas validé");
  }
  if (report.accountId === accountId) {
    res.json(report);
    return;
  }
  if (report.graded) throw new ConflictError("Ce rapport est déjà corrigé — il ne peut plus changer de juré");
  if (accountId) {
    const juror = await db.account.findUnique({ where: { id: accountId } });
    if (!juror || juror.role !== "jury") throw new BadRequestError("Seul un juré peut corriger un rapport");
  }

  const name = await namer([report.id], [report.accountId, accountId]);
  await db.$transaction(async (tx) => {
    if (accountId) {
      await tx.reportAssignment.upsert({
        where: { reportId: report.id },
        create: { reportId: report.id, accountId },
        update: { accountId },
      });
    } else {
      await tx.reportAssignment.deleteMany({ where: { reportId: report.id } });
    }
    await audit(tx, req.user!, {
      category: "Rapports",
      action: accountId ? "report.assign" : "report.unassign",
      summary: `Rapport ${name.report(report.id)} : ${name.juror(accountId)} (avant : ${name.juror(report.accountId)})`,
    });
  });
  res.json({ ...report, accountId });
}));

export default router;
