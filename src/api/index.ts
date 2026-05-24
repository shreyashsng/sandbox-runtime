import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { errorHandler } from "./middleware/errorHandler";
import { logger } from "../lib/logger";

import healthRouter from "./routes/health";
import executeRouter from "./routes/execute";
import jobsRouter from "./routes/jobs";
import keysRouter from "./routes/keys";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.use("/health", healthRouter);
app.use("/execute", executeRouter);
app.use("/job", jobsRouter);
app.use("/api-keys", keysRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not Found", code: "NOT_FOUND" });
});

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`SRAI API running on port ${PORT}`);
});
