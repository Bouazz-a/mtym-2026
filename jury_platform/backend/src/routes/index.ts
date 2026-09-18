import { Router } from "express";
import { db } from "../db";

import authRouter from "./auth";
import accountsRouter from "./accounts";
import teamsRouter from "./teams";
import centerDaysRouter from "./center-days";
import reportsRouter from "./reports";
import drawsRouter from "./draws";
import poolsRouter from "./pools";
import passagesRouter from "./passages";
import criteriaRouter from "./criteria";
import reportEvaluationsRouter from "./report-evaluations";
import oralEvaluationsRouter from "./oral-evaluations";

const router = Router();

router.use("/auth", authRouter);
router.use("/accounts", accountsRouter);
router.use("/teams", teamsRouter);
router.use("/center-days", centerDaysRouter);
router.use("/center-days", drawsRouter);
router.use("/reports", reportsRouter);
router.use("/pools", poolsRouter);
router.use("/passages", passagesRouter);
router.use("/criteria", criteriaRouter);
router.use("/report-evaluations", reportEvaluationsRouter);
router.use("/oral-evaluations", oralEvaluationsRouter);

router.get("/health", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "db_unreachable" });
  }
});

export default router;
