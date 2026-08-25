import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { db } from "../db";

import participantsRouter from "./participants";
import teamsRouter from "./teams";
import juryRouter from "./jury";
import organizersRouter from "./organizers";
import poolsRouter from "./pools";
import passagesRouter from "./passages";
import roundsRouter from "./rounds";
import constraintReportRouter from "./constraint-report";
import documentsRouter from "./documents";
import juryAssignmentsRouter from "./jury-assignments";
import juryPassageAssignmentsRouter from "./jury-passage-assignments";
import criteriaRouter from "./criteria";
import reportEvaluationsRouter from "./report-evaluations";
import oralEvaluationsRouter from "./oral-evaluations";
import workshopsRouter from "./workshops";
import workshopPreferencesRouter from "./workshop-preferences";
import workshopAssignmentsRouter from "./workshop-assignments";
import announcementsRouter from "./announcements";
import deadlinesRouter from "./deadlines";
import devAuthRouter from "./dev-auth";

const router = Router();

router.get("/auth/me", authenticate, (req, res) => res.json(req.user));
router.use("/auth/dev-login", devAuthRouter);

router.use("/participants", participantsRouter);
router.use("/teams", teamsRouter);
router.use("/jury", juryRouter);
router.use("/organizers", organizersRouter);
router.use("/pools", poolsRouter);
router.use("/passages", passagesRouter);
router.use("/rounds", roundsRouter);
router.use("/constraint-report", constraintReportRouter);
router.use("/documents", documentsRouter);
router.use("/jury-assignments", juryAssignmentsRouter);
router.use("/jury-passage-assignments", juryPassageAssignmentsRouter);
router.use("/criteria", criteriaRouter);
router.use("/report-evaluations", reportEvaluationsRouter);
router.use("/oral-evaluations", oralEvaluationsRouter);
router.use("/workshops", workshopsRouter);
router.use("/workshop-preferences", workshopPreferencesRouter);
router.use("/workshop-assignments", workshopAssignmentsRouter);
router.use("/announcements", announcementsRouter);
router.use("/deadlines", deadlinesRouter);

router.get("/health", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "db_unreachable" });
  }
});

export default router;
