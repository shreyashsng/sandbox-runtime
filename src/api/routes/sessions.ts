import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../../db/client";
import { dockerClient } from "../../lib/docker";
import { apiKeyAuth } from "../middleware/auth";
import { nanoid } from "nanoid";
import { PassThrough } from "stream";

const router = Router();

const SessionCreateSchema = z.object({
  name: z.string().optional(),
  language: z.enum(["nodejs", "python"]),
});

router.post("/", apiKeyAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = SessionCreateSchema.parse(req.body);
    const apiKey = (req as any).apiKey;
    
    const volumeName = `srai-session-${nanoid(16)}`;
    
    // Create the docker volume
    await dockerClient.createVolume({ Name: volumeName });
    
    // Fix permissions of the new volume to be owned by sandbox user (UID/GID 2000)
    // We use the appropriate image based on the selected language, or fallback to srai-node
    const image = payload.language === "nodejs" ? "srai-node:latest" : "srai-python:latest";
    const chownContainer = await dockerClient.createContainer({
      Image: image,
      User: "root",
      Cmd: ["chown", "-R", "2000:2000", "/session"],
      HostConfig: {
        Binds: [`${volumeName}:/session:rw`],
      },
    });
    
    try {
      await chownContainer.start();
      await chownContainer.wait();
    } finally {
      await chownContainer.remove({ force: true }).catch(() => {});
    }
    
    // 24 hours expiry
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const session = await prisma.session.create({
      data: {
        name: payload.name,
        volumeName,
        language: payload.language,
        expiresAt,
        apiKeyId: apiKey.id,
      },
    });

    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

router.get("/", apiKeyAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = (req as any).apiKey;
    const sessions = await prisma.session.findMany({
      where: { apiKeyId: apiKey.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/files", apiKeyAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = (req as any).apiKey;
    const session = await prisma.session.findUnique({
      where: { id: String(req.params.id) },
    });

    if (!session || session.apiKeyId !== apiKey.id) {
      return res.status(404).json({ error: "Session not found", code: "NOT_FOUND" });
    }

    // Spin up an ephemeral container to list files.
    // We use srai-node:latest because it's guaranteed to be built locally and is alpine-based.
    const container = await dockerClient.createContainer({
      Image: "srai-node:latest",
      User: "root",
      Cmd: ["sh", "-c", "find /data -type f -exec stat -c '%n|%s|%Y' {} +"],
      HostConfig: {
        Binds: [`${session.volumeName}:/data:ro`],
      },
    });

    try {

    await container.start();
    
    // Wait for the container to finish
    await container.wait();

    // Get the logs as a stream
    const logs = await container.logs({ stdout: true, stderr: true, follow: true });
    
    // Parse the docker multiplexed stream
    let stdoutData = "";
    const stdoutStream = new PassThrough();
    stdoutStream.on("data", (chunk: Buffer) => { stdoutData += chunk.toString("utf8"); });
    
    dockerClient.modem.demuxStream(logs, stdoutStream, process.stderr);
    
    // Wait for the stream to fully process
    await new Promise((resolve) => {
      logs.on("end", resolve);
      logs.on("error", resolve);
      setTimeout(resolve, 500); // fallback
    });

    const files = stdoutData.split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const parts = line.split("|");
        if (parts.length < 3) return null;
        const [fullPath, size, modifiedAt] = parts;
        // Remove the /data prefix
        const path = fullPath.replace(/^\/data\//, "");
        return {
          path,
          size: parseInt(size, 10),
          modifiedAt: parseInt(modifiedAt, 10) * 1000 // Convert unix timestamp to ms
        };
      })
      .filter(file => file !== null);

      res.json({ files });
    } finally {
      await container.remove({ force: true }).catch(() => {});
    }
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", apiKeyAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = (req as any).apiKey;
    const session = await prisma.session.findUnique({
      where: { id: String(req.params.id) },
    });

    if (!session || session.apiKeyId !== apiKey.id) {
      return res.status(404).json({ error: "Session not found", code: "NOT_FOUND" });
    }

    // Remove the docker volume
    try {
      const volume = dockerClient.getVolume(session.volumeName);
      await volume.remove();
    } catch (err: any) {
      // If it doesn't exist (404), we don't care, just delete from DB
      if (err.statusCode !== 404) {
        throw err;
      }
    }

    await prisma.session.delete({
      where: { id: String(req.params.id) },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
