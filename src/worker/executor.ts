import fs from "fs/promises";
import path from "path";
import os from "os";
import { dockerClient } from "../lib/docker";
import { JobPayload } from "../types";

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
  const cmd = language === "nodejs" ? ["node", `/sandbox/${filename}`] : ["python", `/sandbox/${filename}`];

  // Map to absolute path for Docker
  // Replace windows backslashes with forward slashes for Docker desktop bind mounts if needed,
  // but dockerode usually handles absolute paths fine.
  const bindPath = tempDir.replace(/\\/g, '/');

  const container = await dockerClient.createContainer({
    Image: image,
    Cmd: cmd,
    HostConfig: {
      Binds: [`${bindPath}:/sandbox:ro`],
      NetworkMode: "none",
      Memory: 512 * 1024 * 1024,
      MemorySwap: 512 * 1024 * 1024,
      CpuPeriod: 100000,
      CpuQuota: 50000,
      AutoRemove: false,
    },
    User: "sandbox",
  });

  const startTime = Date.now();
  await container.start();

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
  } catch (error: any) {
    if (isTimeout) {
      await container.kill().catch(() => {});
      exitCode = -1;
    } else {
      throw error;
    }
  }

  const durationMs = Date.now() - startTime;

  const rawLogs = await container.logs({ stdout: true, stderr: true, follow: false }) as any as Buffer;
  
  let stdout = "";
  let stderr = "";
  
  if (rawLogs && Buffer.isBuffer(rawLogs)) {
    let offset = 0;
    while (offset < rawLogs.length) {
      if (offset + 8 > rawLogs.length) break;
      const type = rawLogs[offset];
      const length = rawLogs.readUInt32BE(offset + 4);
      offset += 8;
      
      if (offset + length > rawLogs.length) break;
      const payload = rawLogs.subarray(offset, offset + length).toString("utf8");
      
      if (type === 1) {
        stdout += payload;
      } else if (type === 2) {
        stderr += payload;
      }
      
      offset += length;
    }
  }

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
