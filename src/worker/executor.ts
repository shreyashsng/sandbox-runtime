import fs from "fs/promises";
import path from "path";
import os from "os";
import { dockerClient } from "../lib/docker";
import { JobPayload } from "../types";
import { PassThrough } from "stream";
import { publishChunk } from "./streamer";
import { prisma } from "../db/client";
import { redisClient } from "../lib/redis";

export const runningContainers = new Map<string, any>();

const EXECUTION_TIMEOUT_MS = parseInt(process.env.EXECUTION_TIMEOUT_MS || "30000", 10);

export async function runInDocker(payload: JobPayload): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  memoryUsedMb: number;
}> {
  const { jobId, language, code } = payload;
  const tempDir = path.join(os.tmpdir(), `srai-${jobId}`);
  
  const filename = language === "nodejs" ? "index.js" : "main.py";
  const filepath = path.join(tempDir, filename);

  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(filepath, code, "utf8");

  const image = language === "nodejs" ? "srai-node:latest" : "srai-python:latest";
  const cmd = language === "nodejs" ? ["node", `/sandbox/${filename}`] : ["python", "-u", `/sandbox/${filename}`];

  // Map to absolute path for Docker
  // Replace windows backslashes with forward slashes for Docker desktop bind mounts if needed,
  // but dockerode usually handles absolute paths fine.
  const bindPath = tempDir.replace(/\\/g, '/');

  const binds = [`${bindPath}:/sandbox:ro`];

  if (payload.sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
    });
    if (session) {
      // Ensure volume is owned by the sandbox user (UID/GID 2000)
      const chownContainer = await dockerClient.createContainer({
        Image: image,
        User: "root",
        Cmd: ["chown", "-R", "2000:2000", "/session"],
        HostConfig: {
          Binds: [`${session.volumeName}:/session:rw`],
        },
      });
      try {
        await chownContainer.start();
        await chownContainer.wait();
      } catch (err) {
        // Log but continue to avoid blocking execution if docker fails
      } finally {
        await chownContainer.remove({ force: true }).catch(() => {});
      }

      binds.push(`${session.volumeName}:/session:rw`);
      await prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });
    }
  }

  if (payload.packages && payload.packages.length > 0) {
    const pkgSetKey = `pkg_cache:${language}`;
    const installed = await redisClient.smembers(pkgSetKey);
    const toInstall = payload.packages.filter((p: string) => !installed.includes(p));

    const pkgVolumeName = `srai-pkg-${language}`;
    
    try {
      await dockerClient.getVolume(pkgVolumeName).inspect();
    } catch (e) {
      await dockerClient.createVolume({ Name: pkgVolumeName });
      
      const chownContainer = await dockerClient.createContainer({
        Image: image,
        User: "root",
        Cmd: ["chown", "-R", "2000:2000", "/pkg_cache"],
        HostConfig: {
          Binds: [`${pkgVolumeName}:/pkg_cache:rw`],
        },
      });
      try {
        await chownContainer.start();
        await chownContainer.wait();
      } catch (err) { }
      finally { await chownContainer.remove({ force: true }).catch(() => {}); }
    }

    if (toInstall.length > 0) {
      publishChunk(jobId, "system", `[system] Installing packages: ${toInstall.join(", ")}\r\n`);
      
      const pkgCmd = language === "nodejs" 
        ? ["npm", "install", "--prefix", "/pkg_cache", ...toInstall, "--quiet", "--no-fund", "--no-audit"]
        : ["pip", "install", "--target", "/pkg_cache", ...toInstall, "--quiet", "--no-color"];
        
      const pkgContainer = await dockerClient.createContainer({
        Image: image,
        Cmd: pkgCmd,
        HostConfig: { Binds: [`${pkgVolumeName}:/pkg_cache:rw`] },
        User: "sandbox",
      });
      
      let pkgStdout = "";
      let pkgStderr = "";
      
      await pkgContainer.start();
      const pkgLogStream = await pkgContainer.logs({ follow: true, stdout: true, stderr: true });
      const pkgStdoutStream = new PassThrough();
      const pkgStderrStream = new PassThrough();
      
      pkgStdoutStream.on("data", chunk => pkgStdout += chunk.toString("utf8"));
      pkgStderrStream.on("data", chunk => pkgStderr += chunk.toString("utf8"));
      
      pkgContainer.modem.demuxStream(pkgLogStream, pkgStdoutStream, pkgStderrStream);
      
      await pkgContainer.wait();
      const inspect = await pkgContainer.inspect();
      await pkgContainer.remove({ force: true }).catch(() => {});
      
      if (inspect.State.ExitCode !== 0) {
        publishChunk(jobId, "stderr", pkgStderr);
        publishChunk(jobId, "system", `[system] Package installation failed with exit code ${inspect.State.ExitCode}\r\n`);
        
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        
        return {
          stdout: pkgStdout,
          stderr: pkgStderr,
          exitCode: inspect.State.ExitCode,
          durationMs: 0,
          memoryUsedMb: 0
        };
      }
      
      await redisClient.sadd(pkgSetKey, ...toInstall);
    }
    
    binds.push(`${pkgVolumeName}:/pkg_cache:rw`);
  }

  const env = [];
  if (payload.packages && payload.packages.length > 0) {
    if (language === "nodejs") {
      env.push("NODE_PATH=/pkg_cache/node_modules");
    } else {
      env.push("PYTHONPATH=/pkg_cache");
    }
  }

  const container = await dockerClient.createContainer({
    Image: image,
    Cmd: cmd,
    Env: env,
    HostConfig: {
      Binds: binds,
      NetworkMode: "none",
      Memory: 512 * 1024 * 1024,
      MemorySwap: 512 * 1024 * 1024,
      CpuPeriod: 100000,
      CpuQuota: 50000,
      AutoRemove: false,
    },
    User: "sandbox",
  });

  runningContainers.set(jobId, container);

  let stdout = "";
  let stderr = "";

  const startTime = Date.now();
  await container.start();
  publishChunk(jobId, "system", "[system] container started\r\n");

  const logStream = await container.logs({ follow: true, stdout: true, stderr: true });
  const stdoutStream = new PassThrough();
  const stderrStream = new PassThrough();

  stdoutStream.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    stdout += text;
    publishChunk(jobId, "stdout", text);
  });

  stderrStream.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    stderr += text;
    publishChunk(jobId, "stderr", text);
  });

  container.modem.demuxStream(logStream, stdoutStream, stderrStream);

  let isTimeout = false;
  let exitCode = 0;
  
  try {
    await Promise.race([
      container.wait(),
      new Promise((_, reject) => {
        setTimeout(() => {
          isTimeout = true;
          reject(new Error("Timeout"));
        }, EXECUTION_TIMEOUT_MS);
      }),
    ]);
    const inspect = await container.inspect();
    exitCode = inspect.State.ExitCode;
    if (exitCode === 137) exitCode = -1; // Docker killed exit code
  } catch (error: any) {
    if (isTimeout) {
      await container.kill().catch(() => {});
      exitCode = -1;
    } else {
      throw error;
    }
  } finally {
    runningContainers.delete(jobId);
  }

  const durationMs = Date.now() - startTime;
  
  // allow streams to flush
  await new Promise(r => setTimeout(r, 50));

  let memoryUsedMb = 0;
  try {
    const stats = await container.stats({ stream: false });
    memoryUsedMb = stats.memory_stats?.usage ? stats.memory_stats.usage / (1024 * 1024) : 0;
  } catch (err) {
    // ignore
  }

  await container.remove({ force: true }).catch(() => {});
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

  return {
    stdout,
    stderr,
    exitCode,
    durationMs,
    memoryUsedMb,
  };
}
