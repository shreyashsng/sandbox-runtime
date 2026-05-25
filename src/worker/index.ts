import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { redisClient } from "../lib/redis";
import { logger } from "../lib/logger";
import { prisma } from "../db/client";
import { JobPayload } from "../types";
import { runInDocker, runningContainers } from "./executor";
import { publishChunk } from "./streamer";
import cron from "node-cron";
import { dockerClient } from "../lib/docker";

const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "5", 10);

const subscriber = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
subscriber.psubscribe("execution:*");
subscriber.on("pmessage", (pattern, channel, messageStr) => {
  try {
    const message = JSON.parse(messageStr);
    if (message.type === "cancel") {
      const jobId = channel.replace("execution:", "");
      const container = runningContainers.get(jobId);
      if (container) {
        logger.info(`Received cancel for jobId ${jobId}, killing container`);
        container.kill().catch((err: any) => logger.error(`Error killing container ${jobId}`, err));
      }
    }
  } catch (err) {
    logger.error("Error parsing pubsub message", err);
  }
});


export function startWorker() {
  cron.schedule("0 * * * *", async () => {
    try {
      const expiredSessions = await prisma.session.findMany({
        where: { expiresAt: { lt: new Date() } }
      });
      
      if (expiredSessions.length > 0) {
        for (const session of expiredSessions) {
          try {
            const volume = dockerClient.getVolume(session.volumeName);
            await volume.remove();
          } catch (e: any) {
            if (e.statusCode !== 404) {
              logger.error(`Failed to remove volume for expired session ${session.id}`, e);
            }
          }
        }
        
        await prisma.session.deleteMany({
          where: { expiresAt: { lt: new Date() } }
        });
        
        logger.info(`Cleaned up ${expiredSessions.length} expired sessions`);
      }
    } catch (err) {
      logger.error("Error in session cleanup cron job", err);
    }
  });

  const worker = new Worker(
    "executions",
    async (job: Job) => {
      const payload = job.data as JobPayload;
      
      await prisma.execution.update({
        where: { jobId: payload.jobId },
        data: { status: "running" },
      });

      let result;
      let finalStatus = "success";
      let errorMsg = "";

      try {
        result = await runInDocker(payload);
        if (result.exitCode === -1) {
          finalStatus = "killed";
        } else if (result.exitCode !== 0) {
          finalStatus = "failed";
        }
      } catch (error: any) {
        logger.error(`Execution failed for job ${payload.jobId}`, error);
        finalStatus = "failed";
        errorMsg = error.message;
        result = {
          stdout: "",
          stderr: errorMsg,
          exitCode: 1,
          durationMs: 0,
          memoryUsedMb: 0,
        };
      }

      await prisma.execution.update({
        where: { jobId: payload.jobId },
        data: {
          status: finalStatus,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          memoryUsedMb: result.memoryUsedMb,
        },
      });

      publishChunk(payload.jobId, "done", {
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        status: finalStatus,
      });

      return result;
    },
    {
      connection: redisClient,
      concurrency: WORKER_CONCURRENCY,
    }
  );

  worker.on("failed", (job: Job | undefined, err: Error) => {
    logger.error(`Job ${job?.id} failed`, err);
    if (job) {
      const payload = job.data as JobPayload;
      prisma.execution.update({
        where: { jobId: payload.jobId },
        data: {
          status: "failed",
          stderr: err.message,
        },
      }).catch((e) => logger.error("Failed to update DB on job failure", e));
    }
  });

  worker.on("error", (err) => {
    logger.error("Worker error", err);
  });

  logger.info("Worker started, listening for jobs...");
  return worker;
}

if (require.main === module) {
  startWorker();
}
