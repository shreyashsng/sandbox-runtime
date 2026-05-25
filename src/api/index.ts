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
import sessionsRouter from "./routes/sessions";

import { WebSocketServer } from "ws";
import Redis from "ioredis";
import { prisma } from "../db/client";
import { registerStream, broadcastToJob, closeJob } from "./services/streamRegistry";

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
app.use("/session", sessionsRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not Found", code: "NOT_FOUND" });
});

app.use(errorHandler);

const server = app.listen(PORT, () => {
  logger.info(`SRAI API running on port ${PORT}`);
});

const wss = new WebSocketServer({ server, path: "/stream" });
const redisSubscriber = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

redisSubscriber.on("message", (channel, messageStr) => {
  if (channel.startsWith("execution:")) {
    const jobId = channel.replace("execution:", "");
    try {
      const message = JSON.parse(messageStr);
      broadcastToJob(jobId, message);
      if (message.type === "done") {
        closeJob(jobId);
        redisSubscriber.unsubscribe(channel);
      }
    } catch (e) {
      logger.error(`Error processing message for channel ${channel}`, e);
    }
  }
});

wss.on("connection", async (ws, req) => {
  try {
    const url = new URL(req.url!, `ws://localhost`);
    const jobId = url.searchParams.get("jobId");

    if (!jobId) {
      ws.close(1008, "Missing jobId");
      return;
    }

    const execution = await prisma.execution.findUnique({
      where: { jobId },
    });

    if (!execution) {
      ws.close(1008, "Job not found");
      return;
    }

    registerStream(jobId, ws);

    if (execution.status === "success" || execution.status === "failed" || execution.status === "killed") {
      ws.send(JSON.stringify({ type: "stdout", chunk: execution.stdout, ts: Date.now() }));
      ws.send(JSON.stringify({ type: "stderr", chunk: execution.stderr, ts: Date.now() }));
      ws.send(JSON.stringify({ type: "done", exitCode: execution.exitCode, durationMs: execution.durationMs, status: execution.status }));
      closeJob(jobId);
    } else {
      redisSubscriber.subscribe(`execution:${jobId}`);
    }
  } catch (error) {
    logger.error("WebSocket connection error", error);
    ws.close(1011, "Internal server error");
  }
});
