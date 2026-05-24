import { Queue } from "bullmq";
import { redisClient } from "./redis";

export const executionQueue = new Queue("executions", {
  connection: redisClient,
});
