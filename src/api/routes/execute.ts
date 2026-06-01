import { Router, Request, Response, NextFunction } from "express";
import { apiKeyAuth } from "../middleware/auth";
import { ExecutionRequestSchema } from "../../types";
import { prisma } from "../../db/client";
import { executionQueue } from "../../lib/queue";
import { nanoid } from "nanoid";

const router = Router();

router.post("/", apiKeyAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = ExecutionRequestSchema.parse(req.body);
    
    if (payload.packages && payload.packages.length > 0) {
      const blockedPackages = (process.env.BLOCKED_PACKAGES || "subprocess32,dangerous-pkg").split(",");
      for (const pkg of payload.packages) {
        if (blockedPackages.includes(pkg)) {
          return res.status(400).json({ error: `Package '${pkg}' is blocked`, code: "PACKAGE_BLOCKED" });
        }
      }
    }

    const apiKey = (req as any).apiKey;
    const jobId = nanoid();

    const execution = await prisma.execution.create({
      data: {
        jobId,
        language: payload.language,
        code: payload.code,
        status: "queued",
        apiKeyId: apiKey.id,
        sessionId: payload.sessionId,
        packages: payload.packages || [],
      },
    });

    const jobPayload = {
      ...payload,
      jobId,
      apiKeyId: apiKey.id,
      createdAt: execution.createdAt.toISOString(),
    };

    await executionQueue.add("execute", jobPayload, { jobId });

    res.status(202).json({
      jobId,
      status: "queued",
      createdAt: execution.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
