import { Request, Response, NextFunction } from "express";
import { prisma } from "../../db/client";

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized", code: "INVALID_API_KEY" });
  }

  const key = authHeader.substring(7);
  const apiKey = await prisma.apiKey.findUnique({ where: { key } });

  if (!apiKey) {
    return res.status(401).json({ error: "Unauthorized", code: "INVALID_API_KEY" });
  }

  (req as any).apiKey = apiKey;
  next();
}
