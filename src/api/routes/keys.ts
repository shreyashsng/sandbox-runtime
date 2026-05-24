import { Router, Request, Response, NextFunction } from "express";
import { apiKeyAuth } from "../middleware/auth";
import { ApiKeyCreateSchema } from "../../types";
import { prisma } from "../../db/client";
import { Prisma } from "@prisma/client";
import { nanoid } from "nanoid";

const router = Router();

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = ApiKeyCreateSchema.parse(req.body);
    const key = "srai_" + nanoid(32);

    const apiKey = await prisma.apiKey.create({
      data: {
        key,
        name: payload.name,
      },
    });

    res.json({
      id: apiKey.id,
      key: apiKey.key,
      name: apiKey.name,
      createdAt: apiKey.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", apiKeyAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keys = await prisma.apiKey.findMany({
      include: {
        _count: {
          select: { executions: true },
        },
      },
    });

    const safeKeys = keys.map((k: Prisma.ApiKeyGetPayload<{
      include: {
        _count: {
          select: { executions: true }
        }
      }
    }>) => ({
      id: k.id,
      name: k.name,
      createdAt: k.createdAt.toISOString(),
      executionsCount: k._count.executions,
    }));

    res.json(safeKeys);
  } catch (error) {
    next(error);
  }
});

export default router;
