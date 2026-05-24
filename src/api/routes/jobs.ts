import { Router, Request, Response, NextFunction } from "express";
import { apiKeyAuth } from "../middleware/auth";
import { prisma } from "../../db/client";
import { executionQueue } from "../../lib/queue";

const router = Router();

router.get("/:jobId", apiKeyAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    if (typeof jobId !== "string") {
      return res.status(400).json({ error: "Invalid jobId parameter", code: "BAD_REQUEST" });
    }
    const execution = await prisma.execution.findUnique({
      where: { jobId },
    });

    if (!execution) {
      return res.status(404).json({ error: "Job not found", code: "NOT_FOUND" });
    }

    res.json({
      jobId: execution.jobId,
      status: execution.status,
      stdout: execution.stdout,
      stderr: execution.stderr,
      exitCode: execution.exitCode,
      durationMs: execution.durationMs,
      memoryUsedMb: execution.memoryUsedMb,
      cpuPercent: execution.cpuPercent,
      language: execution.language,
      createdAt: execution.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:jobId/logs", apiKeyAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    if (typeof jobId !== "string") {
      return res.status(400).json({ error: "Invalid jobId parameter", code: "BAD_REQUEST" });
    }
    const execution = await prisma.execution.findUnique({
      where: { jobId },
      select: { stdout: true, stderr: true, status: true },
    });

    if (!execution) {
      return res.status(404).json({ error: "Job not found", code: "NOT_FOUND" });
    }

    res.json(execution);
  } catch (error) {
    next(error);
  }
});

router.delete("/:jobId", apiKeyAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    if (typeof jobId !== "string") {
      return res.status(400).json({ error: "Invalid jobId parameter", code: "BAD_REQUEST" });
    }
    const execution = await prisma.execution.findUnique({
      where: { jobId },
    });

    if (!execution) {
      return res.status(404).json({ error: "Job not found", code: "NOT_FOUND" });
    }

    if (execution.status === "queued") {
      const job = await executionQueue.getJob(execution.jobId);
      if (job) {
        await job.remove();
      }
      await prisma.execution.update({
        where: { jobId: execution.jobId },
        data: { status: "killed" },
      });
    } else if (execution.status === "running") {
      // Phase 2: send cancel event via redis pub/sub
      // For now just update DB
      await prisma.execution.update({
        where: { jobId: execution.jobId },
        data: { status: "killed" },
      });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
