import { Router } from "express";
import { db } from "../db";
import { authenticate } from "../middleware/auth";
import { juryCanAccessPresentation } from "../services/access";
import { REPORT_URL_TTL, signedReportUrl } from "../services/reportFiles";
import { asyncRoute, ForbiddenError, NotFoundError } from "../utils/errors";

const router = Router();

// GET /api/presentations/:id/url -> { url, expiresIn } — a short-lived link
// to the PDF a team shows when it defends, kept with the reports in the main
// site's private bucket.
router.get("/:id/url", authenticate, asyncRoute(async (req, res) => {
  const user = req.user!;
  const presentation = await db.teamPresentation.findUnique({ where: { id: req.params.id } });
  if (!presentation) throw new NotFoundError("Presentation not found");

  if (user.role === "jury" && !(await juryCanAccessPresentation(user.id, presentation.teamId, presentation.problemNumber))) {
    throw new ForbiddenError("Vous ne jugez pas cette défense");
  }

  res.json({ url: await signedReportUrl(presentation.fileUrl), expiresIn: REPORT_URL_TTL });
}));

export default router;
