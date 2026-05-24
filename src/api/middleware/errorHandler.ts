import { Request, Response, NextFunction } from "express";
import { logger } from "../../lib/logger";

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  logger.error("Unhandled error:", err);
  const code = err.code || "INTERNAL_SERVER_ERROR";
  const message = err.message || "An unexpected error occurred";
  
  if (err.name === "ZodError") {
    return res.status(400).json({ error: "Validation Error", code: "BAD_REQUEST", details: err.errors });
  }

  res.status(500).json({ error: message, code });
}
