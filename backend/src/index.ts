import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import { config } from "./config";
import apiRouter from "./routes/index";
import { errorHandler } from "./utils/errors";

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());

// Ensure uploads directory exists
fs.mkdirSync(config.uploadsDir, { recursive: true });

app.use("/api", apiRouter);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`MTYM backend running on http://localhost:${config.port}`);
});
