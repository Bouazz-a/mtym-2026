import { Router } from "express";
import { db } from "../db";

import authRouter from "./auth";
import accountsRouter from "./accounts";
import teamsRouter from "./teams";
import centerDaysRouter from "./center-days";
import reportsRouter from "./reports";

const router = Router();

router.use("/auth", authRouter);
router.use("/accounts", accountsRouter);
router.use("/teams", teamsRouter);
router.use("/center-days", centerDaysRouter);
router.use("/reports", reportsRouter);

router.get("/health", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "db_unreachable" });
  }
});

export default router;
