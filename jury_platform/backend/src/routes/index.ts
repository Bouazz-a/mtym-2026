import { Router } from "express";
import { db } from "../db";

import authRouter from "./auth";
import accountsRouter from "./accounts";

const router = Router();

router.use("/auth", authRouter);
router.use("/accounts", accountsRouter);

router.get("/health", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "db_unreachable" });
  }
});

export default router;
