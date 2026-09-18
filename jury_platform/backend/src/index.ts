import "dotenv/config";
import express from "express";
import { config } from "./config";
import apiRouter from "./routes/index";
import { errorHandler } from "./utils/errors";

const app = express();

// Behind Caddy in production: trust its X-Forwarded-For so the login rate
// limit keys on the real client IP.
app.set("trust proxy", 1);
app.use(express.json());

app.use("/api", apiRouter);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`MTYM jury backend running on http://localhost:${config.port}`);
});
