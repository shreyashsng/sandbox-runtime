import { Router, Request, Response } from "express";
import { redisClient } from "../../lib/redis";
import { prisma } from "../../db/client";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  let redisStatus = "error";
  let dbStatus = "error";

  try {
    await redisClient.ping();
    redisStatus = "ok";
  } catch (e) {}

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "ok";
  } catch (e) {}

  res.json({
    status: "ok",
    redis: redisStatus,
    db: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

export default router;
