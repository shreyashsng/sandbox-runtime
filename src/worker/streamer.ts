import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
export const pubClient = new Redis(redisUrl);

export function publishChunk(jobId: string, type: "stdout" | "stderr" | "done" | "system", data?: any) {
  let message;
  if (type === "done") {
    message = { type, ...data };
  } else {
    message = { type, chunk: data, ts: Date.now() };
  }
  pubClient.publish(`execution:${jobId}`, JSON.stringify(message));
}
