import { Router } from "express";
import { db } from "../db";
import { authenticate } from "../middleware/auth";
import { juryCanAccessReport } from "../services/access";
import { REPORT_URL_TTL, signedReportUrl } from "../services/reportFiles";
import { asyncRoute, ForbiddenError, NotFoundError } from "../utils/errors";

const router = Router();

// GET /api/reports/:id/url -> { url, expiresIn } — a short-lived link to the
// PDF in the main site's private bucket.
router.get("/:id/url", authenticate, asyncRoute(async (req, res) => {
  const user = req.user!;
  const report = await db.teamReport.findUnique({ where: { id: req.params.id } });
  if (!report) throw new NotFoundError("Report not found");

  if (user.role === "jury" && !(await juryCanAccessReport(user.id, report.teamId, report.problemNumber))) {
    throw new ForbiddenError("Vous ne notez pas ce rapport");
  }

  res.json({ url: await signedReportUrl(report.fileUrl), expiresIn: REPORT_URL_TTL });
}));

export default router;
